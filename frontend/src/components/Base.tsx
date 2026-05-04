import { useState, useEffect, useCallback, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { Outlet } from "react-router-dom";
import { ChatBubbleLeftRightIcon, UserGroupIcon, DocumentTextIcon, Cog6ToothIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "../hooks/useTranslation";
import { useWebSocket } from "../contexts/WebSocketContext";
import { usePopup } from "../contexts/PopupContext";
import { useUser } from "../contexts/UserContext";
import { chatService } from "../services/chat";
import { friendshipService } from "../services/friendship";
import { Tooltip } from "./Tooltip";
import Settings from "./sidebar/Settings";
import Friends from "./sidebar/Friends";
import Chats from "./sidebar/Chats";
import Notes from "./sidebar/Notes";
import { pruneOldIcons } from "../utils/localForage";
import type { Pagination } from "../types";
import type { DirectChatItem, GameChatItem, SidebarChatFilter, SidebarChatType, SidebarChatView } from "../types/chat";
import type { ResponseDirectChatMessage, ResponseGameChatMessage, ResponseUser, ServerMessage } from "../types/websocket";
import "../css/Base.css";

const MIN_WIDTH = 200;
const COLLAPSED_SIDEBAR_WIDTH = 60;
const MAX_SIDEBAR_WIDTH_RATIO = 0.4;

const CHAT_LIST_PAGINATION: Pagination = { limit: 20, offset: 0 };

const clampSidebarWidth = (width: number) => {
	const maxWidth = window.innerWidth * MAX_SIDEBAR_WIDTH_RATIO;

	return Math.min(maxWidth, Math.max(MIN_WIDTH, width));
};

const directLastMessageFromWs = (message: ResponseDirectChatMessage): NonNullable<DirectChatItem["lastMessage"]> => ({
	senderId: message.senderId,
	message: message.message,
	editedAt: message.editedAt,
	deletedAt: message.deletedAt,
	createdAt: message.createdAt
});

const gameLastMessageFromWs = (message: ResponseGameChatMessage): NonNullable<GameChatItem["lastMessage"]> => ({
	playerId: message.playerId,
	message: message.message,
	messageType: message.messageType,
	dayNumber: message.dayNumber,
	phase: message.phase,
	createdAt: message.createdAt
});

const Base = () => {
	const { t } = useTranslation();
	const { subscribe } = useWebSocket();
	const { showPopup } = usePopup();
	const { user, authReady } = useUser();

	const [sidebarExpanded, setSidebarExpanded] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(300);
	const [activeSidebarSection, setActiveSidebarSection] = useState<"chat" | "friends" | "notes" | "settings">("chat");

	const [directChats, setDirectChats] = useState<DirectChatItem[]>([]);
	const [gameChats, setGameChats] = useState<GameChatItem[]>([]);
	const [selectedChat, setSelectedChat] = useState<string | null>(null);
	const [selectedChatName, setSelectedChatName] = useState<string | null>(null);
	const [selectedChatType, setSelectedChatType] = useState<SidebarChatType>("direct");
	const [selectedDirectChatId, setSelectedDirectChatId] = useState<number | null>(null);
	const [chatView, setChatView] = useState<SidebarChatView>("list");
	const [chatFilter, setChatFilter] = useState<SidebarChatFilter>("direct");

	const [isInitialChatsLoading, setIsInitialChatsLoading] = useState(false);
	const [isLoadingMoreDirectChats, setIsLoadingMoreDirectChats] = useState(false);
	const [isLoadingMoreGameChats, setIsLoadingMoreGameChats] = useState(false);
	const [directChatsTotal, setDirectChatsTotal] = useState(0);
	const [gameChatsTotal, setGameChatsTotal] = useState(0);
	const [directChatsOffset, setDirectChatsOffset] = useState(0);
	const [gameChatsOffset, setGameChatsOffset] = useState(0);

	const [hasUnreadDirect, setHasUnreadDirect] = useState(false);
	const [hasPendingFriendRequests, setHasPendingFriendRequests] = useState(false);
	const [notePopupIds] = useState(() => new Map<number, string>());

	const initialChatsRequested = useRef(false);
	const socialIndicatorsRequestedUserIdRef = useRef<number | null>(null);
	const directChatIdByUserIdRef = useRef<Map<number, number>>(new Map());
	const directChatsRef = useRef<DirectChatItem[]>([]);
	const gameChatsRef = useRef<GameChatItem[]>([]);
	const activeSidebarSectionRef = useRef(activeSidebarSection);
	const chatViewRef = useRef(chatView);
	const selectedChatRef = useRef<string | null>(selectedChat);
	const selectedChatNameRef = useRef<string | null>(selectedChatName);
	const selectedChatTypeRef = useRef<SidebarChatType>(selectedChatType);
	const currentUserIdRef = useRef<number | undefined>(user?.id);
	const sidebarRatioRef = useRef(sidebarWidth / window.innerWidth);
	const autoOpenedGameChatIdsRef = useRef<Set<string>>(new Set());
	const gameCodeByGameIdRef = useRef<Map<string, string>>(new Map());
	const pendingDirectTargetsRef = useRef<Array<{ directChatId: number | null; message: string; user: ResponseUser }>>([]);

	// 4 sections
	const sidebarSections = [
		{ id: "chat" as const, icon: ChatBubbleLeftRightIcon, label: t("components.sidebar.chats")},
		{ id: "friends" as const, icon: UserGroupIcon, label: t("components.sidebar.friends")},
		{ id: "notes" as const, icon: DocumentTextIcon, label: t("components.sidebar.notes.header")},
		{ id: "settings" as const, icon: Cog6ToothIcon, label: t("components.sidebar.settings.header")}
	];

	// Keep main content aligned with the current sidebar width
	const mainStyle: CSSProperties = sidebarExpanded
		? { marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)`}
		: { marginLeft: `${COLLAPSED_SIDEBAR_WIDTH}px`, width: `calc(100% - ${COLLAPSED_SIDEBAR_WIDTH}px)` };

	// Sortings based on last message (backend already sends sorted but from socket may not be)
	const sortDirectChats = useCallback((items: DirectChatItem[]) => {
		return [...items].sort((a, b) => {
			const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
			const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;

			return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
		});
	}, []);

	const isDirectChatUnread = useCallback((chat: DirectChatItem) => {
		if (chat.lastMessageRead) return false;
		if (!chat.lastMessage) return true;
		if (!user?.id) return true;

		return chat.lastMessage.senderId !== user.id;
	}, [user?.id]);
	const sortGameChats = useCallback((items: GameChatItem[]) => {
		return [...items].sort((a, b) => {
			const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
			const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
			const safeATime = Number.isNaN(aTime) ? 0 : aTime;
			const safeBTime = Number.isNaN(bTime) ? 0 : bTime;

			if (safeATime === safeBTime) {
				return b.id - a.id;
			}

			return safeBTime - safeATime;
		});
	}, []);

	// Add a new direct chat to the top of the list and sort by last message
	const upsertDirectChatToTop = useCallback((incoming: DirectChatItem) => {
		setDirectChats((prev) => {
			const existing = prev.find((chat) => chat.user.id === incoming.user.id || chat.id === incoming.id);
			const merged = existing ? { ...existing, ...incoming } : incoming;
			const filtered = prev.filter((chat) => chat.user.id !== merged.user.id && chat.id !== merged.id);

			return sortDirectChats([merged, ...filtered]);
		});
	}, [sortDirectChats]);
	const upsertGameChatToTop = useCallback((incoming: GameChatItem) => {
		setGameChats((prev) => {
			const existing = prev.find((chat) => chat.id === incoming.id);
			const merged = existing ? { ...existing, ...incoming } : incoming;
			const filtered = prev.filter((chat) => chat.id !== merged.id);

			return sortGameChats([merged, ...filtered]);
		});
	}, [sortGameChats]);

	// Refresh social indicators (unread direct chats, pending friend requests)
	const refreshSocialIndicators = useCallback(async () => {
		const [unreadRes, pendingRes] = await Promise.all([
			chatService.hasUnreadDirect().catch(() => null),
			friendshipService.hasPendingRequests().catch(() => null)
		]);

		if (unreadRes?.success) {
			setHasUnreadDirect(Boolean(unreadRes.result));
		}

		if (pendingRes?.success) {
			setHasPendingFriendRequests(Boolean(pendingRes.result));
		}
	}, []);

	const fetchInitialChats = useCallback(async (force = false) => {
		if (initialChatsRequested.current && !force) return;

		initialChatsRequested.current = true;

		setIsInitialChatsLoading(true);

		try {
			const [directChatsRes, gameChatsRes] = await Promise.all([
				chatService.getDirectChats(CHAT_LIST_PAGINATION).catch(() => null),
				chatService.getGameChats(CHAT_LIST_PAGINATION).catch(() => null)
			]);

			if (directChatsRes?.success && directChatsRes.result) {
				const items = sortDirectChats(directChatsRes.result.data ?? []);

				setDirectChats(items);
				setDirectChatsTotal(directChatsRes.result.total ?? 0);
				setDirectChatsOffset(items.length);
			} else {
				setDirectChats([]);
				setDirectChatsTotal(0);
				setDirectChatsOffset(0);
			}

			if (gameChatsRes?.success && gameChatsRes.result) {
				const items = sortGameChats(gameChatsRes.result.data ?? []);

				setGameChats(items);
				setGameChatsTotal(gameChatsRes.result.total ?? 0);
				setGameChatsOffset(items.length);
			} else {
				setGameChats([]);
				setGameChatsTotal(0);
				setGameChatsOffset(0);
			}

		} finally {
			setIsInitialChatsLoading(false);
		}
	}, [sortDirectChats, sortGameChats]);

	// Load more direct chats when needed
	const loadMoreDirectChats = useCallback(async () => {
		if (isLoadingMoreDirectChats || isInitialChatsLoading) return;
		if (directChatsTotal > 0 && directChats.length >= directChatsTotal) return;

		setIsLoadingMoreDirectChats(true);

		try {
			const response = await chatService.getDirectChats({ limit: CHAT_LIST_PAGINATION.limit, offset: directChatsOffset }).catch(() => null);

			if (response?.success && response.result) {
				const incoming = response.result.data ?? [];

				setDirectChats((prev) => {
					const byUserId = new Map<number, DirectChatItem>();

					for (const chat of prev) {
						byUserId.set(chat.user.id, chat);
					}

					for (const chat of incoming) {
						byUserId.set(chat.user.id, chat);
					}

					return sortDirectChats(Array.from(byUserId.values()));
				});

				setDirectChatsTotal(response.result.total ?? 0);
				setDirectChatsOffset((prev) => prev + incoming.length);
			}
		} finally {
			setIsLoadingMoreDirectChats(false);
		}
	}, [directChats.length, directChatsOffset, directChatsTotal, isInitialChatsLoading, isLoadingMoreDirectChats, sortDirectChats]);

	// Load more game chats when needed
	const loadMoreGameChats = useCallback(async () => {
		if (isLoadingMoreGameChats || isInitialChatsLoading) return;
		if (gameChatsTotal > 0 && gameChats.length >= gameChatsTotal) return;

		setIsLoadingMoreGameChats(true);

		try {
			const response = await chatService.getGameChats({ limit: CHAT_LIST_PAGINATION.limit, offset: gameChatsOffset }).catch(() => null);

			if (response?.success && response.result) {
				const incoming = response.result.data ?? [];

				setGameChats((prev) => {
					const byId = new Map<number, GameChatItem>();

					for (const chat of prev) {
						byId.set(chat.id, chat);
					}

					for (const chat of incoming) {
						byId.set(chat.id, chat);
					}

					return sortGameChats(Array.from(byId.values()));
				});

				setGameChatsTotal(response.result.total ?? 0);
				setGameChatsOffset((prev) => prev + incoming.length);
			}
		} finally {
			setIsLoadingMoreGameChats(false);
		}
	}, [gameChats.length, gameChatsOffset, gameChatsTotal, isInitialChatsLoading, isLoadingMoreGameChats, sortGameChats]);

	// Handle opening a chat from sidebar when a chatroom doesnt exist yet or the user chose this way
	const handleOpenChat = (chatId: string, chatName: string, chatType: SidebarChatType) => {
		setSelectedChat(chatId);
		setSelectedChatName(chatName);
		setSelectedChatType(chatType);
		setChatView("chat");
		setSelectedDirectChatId(null);

		if (chatType !== "direct") return;

		const targetUserId = Number.parseInt(chatId, 10);
		if (!Number.isFinite(targetUserId)) return;

		setSelectedDirectChatId(directChatIdByUserIdRef.current.get(targetUserId) ?? null);

		setDirectChats((prev) => {
			const next = prev.map((chat) => (chat.user.id === targetUserId ? { ...chat, lastMessageRead: true } : chat));
			setHasUnreadDirect(next.some(isDirectChatUnread));
			return next;
		});
	};

	// Handle going back to the chat list from a specific chat
	const handleBackToList = () => {
		setChatView("list");
		setSelectedChat(null);
		setSelectedChatName(null);
		setSelectedChatType("direct");
		setSelectedDirectChatId(null);
	};

	// Handle message sent to update the last message in the chat list
	const handleMessageSent = (chatId: string, message: string, chatType: SidebarChatType) => {
		const createdAt = new Date().toISOString();

		if (chatType === "direct") {
			const targetUserId = Number.parseInt(chatId, 10);
			if (!Number.isFinite(targetUserId)) return;

			const existing = directChatsRef.current.find((chat) => chat.user.id === targetUserId);
			const targetUser = existing?.user ?? {
				id: targetUserId,
				username: selectedChatNameRef.current ?? "Direct Chat",
				player: {
					id: 0,
					iconEtag: null
				}
			};

			pendingDirectTargetsRef.current.push({
				directChatId: existing?.id ?? null,
				message,
				user: targetUser
			});

			setDirectChats((prev) => {
				const lastMessage = {
					senderId: user?.id ?? existing?.lastMessage?.senderId ?? 0,
					message,
					editedAt: null,
					deletedAt: null,
					createdAt
				};
				const optimisticChat: DirectChatItem = {
					...(existing ?? {
						id: 0,
						friendshipId: 0,
						user: targetUser
					}),
					lastMessageRead: true,
					lastMessage
				};

				const next = sortDirectChats([
					optimisticChat,
					...prev.filter((chat) => chat.user.id !== targetUserId)
				]);

				setHasUnreadDirect(next.some(isDirectChatUnread));

				return next;
			});
		} else {
			const gameId = Number.parseInt(chatId, 10);
			if (!Number.isFinite(gameId)) return;

			setGameChats((prev) => {
				const existing = prev.find((chat) => chat.id === gameId);
				if (!existing) return prev;

				const updated: GameChatItem = {
					...existing,
					lastMessage: {
						playerId: user?.player?.id ?? null,
						message,
						messageType: "player",
						dayNumber: existing.lastMessage?.dayNumber ?? 1,
						phase: existing.lastMessage?.phase ?? "day",
						createdAt
					}
				};

				// Game chats do not use an unread indicator; only update the preview and ordering
				return sortGameChats([updated, ...prev.filter((chat) => chat.id !== gameId)]);
			});
		}
	};

	// Chat popup handler
	const handleOpenChatPopup = (chatId: string, chatName: string, chatType: SidebarChatType, gameStatus?: GameChatItem["status"]) => {
		const targetUserId = chatType === "direct" ? Number.parseInt(chatId, 10) : null;
		const directChatId = targetUserId !== null && Number.isFinite(targetUserId) ? directChatIdByUserIdRef.current.get(targetUserId) ?? null : null;
		const gameId = chatType === "game" ? Number.parseInt(chatId, 10) : null;
		const resolvedGameStatus = gameId !== null && Number.isFinite(gameId) ? gameStatus ?? gameChatsRef.current.find((chat) => chat.id === gameId)?.status : undefined;

		showPopup({
			type: "chat",
			title: chatName,
			position: "center",
			width: 400,
			height: 600,
			payload: {
				chatId,
				chatName,
				chatType,
				directChatId,
				gameStatus: resolvedGameStatus
			}
		});
	};

	// Start a direct chat with a friend
	const handleStartFriendChat = (friendId: string, friendName: string) => {
		const friendUserId = Number.parseInt(friendId, 10);
		if (!Number.isFinite(friendUserId)) return;

		setActiveSidebarSection("chat");
		setChatFilter("direct");
		handleOpenChat(friendId, friendName, "direct");
	};

	// Toggle sidebar expansion
	const toggleSidebar = useCallback(() => {
		setSidebarExpanded((prev) => {
			const next = !prev;

			if (!prev && next) {
				setSidebarWidth(clampSidebarWidth(sidebarRatioRef.current * window.innerWidth));
			}

			return next;
		});
	}, []);

	// Resize the expanded sidebar by dragging the separator
	const handleMouseDown = useCallback((e: ReactMouseEvent) => {
		if (!sidebarExpanded) return;

		e.preventDefault();

		const startX = e.clientX;
		const startWidth = sidebarWidth;

		const handleMouseMove = (ev: MouseEvent) => {
			const nextWidth = clampSidebarWidth(startWidth + (ev.clientX - startX));

			setSidebarWidth(nextWidth);
			sidebarRatioRef.current = nextWidth / window.innerWidth;
		};

		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}, [sidebarExpanded, sidebarWidth]);


	const renderSidebarContent = () => {
		if (!sidebarExpanded) return null;
		return (
			<>
				<div className={`sidebar-section ${activeSidebarSection === "chat" ? "active" : "hidden"}`}>
					<Chats
						directChats={directChats}
						gameChats={gameChats}
						chatView={chatView}
						selectedChat={selectedChat}
						selectedChatName={selectedChatName}
						selectedChatType={selectedChatType}
						selectedDirectChatId={selectedDirectChatId}
						onOpenChat={handleOpenChat}
						onBackToList={handleBackToList}
						onMessageSent={handleMessageSent}
						onOpenChatPopup={handleOpenChatPopup}
						chatFilter={chatFilter}
						onFilterChange={setChatFilter}
						loadingChats={isInitialChatsLoading}
						hasMoreDirectChats={directChats.length < directChatsTotal}
						hasMoreGameChats={gameChats.length < gameChatsTotal}
						loadingMoreDirectChats={isLoadingMoreDirectChats}
						loadingMoreGameChats={isLoadingMoreGameChats}
						onLoadMoreDirectChats={loadMoreDirectChats}
						onLoadMoreGameChats={loadMoreGameChats}
						hasUnreadDirect={hasUnreadDirect}
					/>
				</div>

				<div className={`sidebar-section ${activeSidebarSection === "friends" ? "active" : "hidden"}`}>
					<Friends onStartFriendChat={handleStartFriendChat} />
				</div>

				<div className={`sidebar-section ${activeSidebarSection === "notes" ? "active" : "hidden"}`}>
					<Notes notePopupIds={notePopupIds} />
				</div>

				<div className={`sidebar-section ${activeSidebarSection === "settings" ? "active" : "hidden"}`}>
					{activeSidebarSection === "settings" && <Settings />}
				</div>
			</>
		);
	};

	// Remove old icons from memory on mount
	useEffect(() => {
		void pruneOldIcons();
	}, []);

	// Refresh social indicators on mount
	useEffect(() => {
		if (!user || !authReady) {
			socialIndicatorsRequestedUserIdRef.current = null;
			return;
		}

		if (socialIndicatorsRequestedUserIdRef.current === user.id) return;

		socialIndicatorsRequestedUserIdRef.current = user.id;
		void refreshSocialIndicators();
	}, [authReady, refreshSocialIndicators, user]);

	// Fetch chat summaries as soon as the authenticated shell is ready.
	useEffect(() => {
		if (!user || !authReady) {
			initialChatsRequested.current = false;
			pendingDirectTargetsRef.current = [];
			setDirectChats([]);
			setGameChats([]);
			setDirectChatsTotal(0);
			setGameChatsTotal(0);
			setDirectChatsOffset(0);
			setGameChatsOffset(0);
			return;
		}

		if (initialChatsRequested.current) return;

		void fetchInitialChats();
	}, [authReady, fetchInitialChats, user]);

	// Socket messages
	useEffect(() => {
		const nextMap = new Map<number, number>();

		for (const chat of directChats) {
			if (chat.id <= 0) continue;
			nextMap.set(chat.user.id, chat.id);
		}

		directChatIdByUserIdRef.current = nextMap;
	}, [directChats]);

	// Keep refs updated so socket handlers can use latest state without resubscribing
	useEffect(() => {
		directChatsRef.current = directChats;
	}, [directChats]);

	useEffect(() => {
		setHasUnreadDirect(directChats.some(isDirectChatUnread));
	}, [directChats, isDirectChatUnread]);

	useEffect(() => {
		gameChatsRef.current = gameChats;
	}, [gameChats]);

	useEffect(() => {
		activeSidebarSectionRef.current = activeSidebarSection;
	}, [activeSidebarSection]);

	useEffect(() => {
		chatViewRef.current = chatView;
	}, [chatView]);

	useEffect(() => {
		selectedChatRef.current = selectedChat;
	}, [selectedChat]);

	useEffect(() => {
		selectedChatNameRef.current = selectedChatName;
	}, [selectedChatName]);

	useEffect(() => {
		selectedChatTypeRef.current = selectedChatType;
	}, [selectedChatType]);

	useEffect(() => {
		currentUserIdRef.current = user?.id;
	}, [user?.id]);

	useEffect(() => {
		const unsubscribe = subscribe((msg: ServerMessage) => {
			switch (msg.type) {
				case "GAME_STARTED":
					gameCodeByGameIdRef.current.set(msg.gameId.toString(), msg.gameCode);
					return;
				case "GAME_CHAT_MESSAGE": {
					const data = msg.data;
					const existing = gameChatsRef.current.find((chat) => chat.id === data.gameId);
					const gameChatId = data.gameId.toString();
					const gameCode = gameCodeByGameIdRef.current.get(gameChatId);
					const gameChatName = existing?.gameCode ?? gameCode ?? `Game ${data.gameId}`;

					upsertGameChatToTop({
						id: data.gameId,
						gameCode: gameChatName,
						status: existing?.status ?? "in_progress",
						lastMessage: gameLastMessageFromWs(data),
						user: data.user ?? existing?.user ?? null,
						bot: data.bot ?? existing?.bot ?? {
							id: 0,
							name: "System",
							player: {
								id: 0,
								iconEtag: null
							}
						}
					});

					const isStartSystemMessage = data.messageType === "system" && data.dayNumber === 1 && data.phase === "day";

					if (isStartSystemMessage && !autoOpenedGameChatIdsRef.current.has(gameChatId)) {
						autoOpenedGameChatIdsRef.current.add(gameChatId);
						setActiveSidebarSection("chat");
						setChatFilter("game");
						setSelectedChat(gameChatId);
						setSelectedChatName(gameChatName);
						setSelectedChatType("game");
						setChatView("chat");
					}

					return;
				}
				case "DIRECT_CHAT_MESSAGE": {
					const data = msg.data;
					const currentUserId = currentUserIdRef.current;
					if (!currentUserId) return;

					const incomingFromMe = data.senderId === currentUserId;
					const existingByChatId = directChatsRef.current.find((chat) => chat.id === data.chatId);
					let directUser = incomingFromMe ? existingByChatId?.user : data.user ?? existingByChatId?.user;

					if (!directUser && incomingFromMe) {
						const pendingIndex = pendingDirectTargetsRef.current.findIndex((pending) => {
							return pending.directChatId === data.chatId || (pending.directChatId === null && pending.message === data.message);
						});

						if (pendingIndex !== -1) {
							directUser = pendingDirectTargetsRef.current[pendingIndex].user;
							pendingDirectTargetsRef.current.splice(pendingIndex, 1);
						}
					}

					if (!directUser && incomingFromMe && selectedChatTypeRef.current === "direct" && selectedChatRef.current) {
						const selectedDirectUserId = Number.parseInt(selectedChatRef.current, 10);

						if (Number.isFinite(selectedDirectUserId)) {
							directUser = {
								id: selectedDirectUserId,
								username: selectedChatNameRef.current ?? "Direct Chat",
								player: {
									id: 0,
									iconEtag: null
								}
							};
						}
					}

					if (!directUser) {
						void fetchInitialChats(true);
						return;
					}

					const existing = existingByChatId ?? directChatsRef.current.find((chat) => chat.user.id === directUser.id);

					const isOpenDirectChat =
						activeSidebarSectionRef.current === "chat" &&
						chatViewRef.current === "chat" &&
						selectedChatTypeRef.current === "direct" &&
						selectedChatRef.current === directUser.id.toString();

					if (isOpenDirectChat) {
						setSelectedDirectChatId(data.chatId);
					}

					upsertDirectChatToTop({
						id: data.chatId,
						friendshipId: existing?.friendshipId ?? data.chatId,
						lastMessageRead: incomingFromMe || isOpenDirectChat,
						lastMessage: directLastMessageFromWs(data),
						user: existing?.user ?? directUser
					});

					if (!incomingFromMe && !isOpenDirectChat) {
						setHasUnreadDirect(true);
					}

					return;
				}
				case "DIRECT_CHAT_MESSAGE_EDITED": {
					const data = msg.data;
					const existing = directChatsRef.current.find((chat) => chat.id === data.chatId);

					if (!existing?.lastMessage) return;
					const existingTime = new Date(existing.lastMessage.createdAt).getTime();
					const incomingTime = new Date(data.createdAt).getTime();
					if ((Number.isNaN(existingTime) ? 0 : existingTime) !== (Number.isNaN(incomingTime) ? 0 : incomingTime)) return;
					if (existing.lastMessage.senderId !== data.senderId) return;

					upsertDirectChatToTop({
						...existing,
						lastMessage: directLastMessageFromWs(data)
					});

					return;
				}
				case "FRIEND_REQUEST_RECEIVED":
					setHasPendingFriendRequests(true);
					return;
				case "ACCEPT_FRIEND_REQUEST_OK":
				case "REJECT_FRIEND_REQUEST_OK":
				case "FRIEND_REQUEST_CANCELLED":
					void refreshSocialIndicators();
					return;
			}
		});

		return unsubscribe;
	}, [fetchInitialChats, isDirectChatUnread, refreshSocialIndicators, subscribe, upsertDirectChatToTop, upsertGameChatToTop]);

	useEffect(() => {
		const handleResize = () => {
			setSidebarWidth((prev) => {
				const next = clampSidebarWidth(prev);

				sidebarRatioRef.current = next / window.innerWidth;

				return next;
			});
		};

		window.addEventListener("resize", handleResize);

		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return (
		<div className="layout">
			<aside
				className="sidebar"
				style={{ width: sidebarExpanded ? `${sidebarWidth}px` : `${COLLAPSED_SIDEBAR_WIDTH}px` }}
			>
				<div className="sidebar-header">
					{sidebarExpanded && <h1 className="sidebar-title">{t("components.sidebar.menu")}</h1>}

					<button className="toggle-button" onClick={toggleSidebar} type="button">
						{sidebarExpanded ? (
							<ChevronLeftIcon className="icon" />
						) : (
							<ChevronRightIcon className="icon" />
						)}
					</button>
				</div>

				{sidebarExpanded && (
					<nav className="sidebar-nav">
						{sidebarSections.map((section) => (
							<Tooltip
								key={section.id}
								content={section.label}
								position="right"
								containerClassName="sidebar-nav-container"
								showDelay={1000}
							>
								<button
									type="button"
									className={`nav-item ${activeSidebarSection === section.id ? "active" : ""}`}
									onClick={() => setActiveSidebarSection(section.id)}
								>
									{section.id === "chat" && hasUnreadDirect && <span className="nav-item-dot" />}
									{section.id === "friends" && hasPendingFriendRequests && <span className="nav-item-dot" />}
									<section.icon className="nav-icon" />
								</button>
							</Tooltip>
						))}
					</nav>
				)}

				{sidebarExpanded && renderSidebarContent()}

				{sidebarExpanded && (
					<div
						className="resize-handle"
						onMouseDown={handleMouseDown}
						role="separator"
						aria-orientation="vertical"
					/>
				)}
			</aside>

			<main className={`main-content ${sidebarExpanded ? "sidebar-expanded" : ""}`} style={mainStyle}>
				<Outlet />
			</main>
		</div>
	);
};

export default Base;
