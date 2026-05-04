import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, UIEvent } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ChatBubbleLeftRightIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "../../hooks/useTranslation";
import { Tooltip } from "../Tooltip";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { useUser } from "../../contexts/UserContext";
import { usePopup } from "../../contexts/PopupContext";
import { chatService } from "../../services/chat";
import { usePlayerIcons } from "../../hooks/usePlayerIcons";
import defaultIcon from "../../assets/default-user-icon.png";
import type { Pagination } from "../../types";
import type { ChatMessage, ChatMeta, ChatStoreSnapshot, DirectChatItem, DirectChatMessagesResponse, GameChatItem, GameChatMessagesResponse, SidebarChatFilter, SidebarChatType, SidebarChatView } from "../../types/chat";
import type { ResponseDirectChatMessage, ServerMessage } from "../../types/websocket";
import "../../css/chat.css";

type ChatsProps = {
	directChats: DirectChatItem[];
	gameChats: GameChatItem[];
	chatView: SidebarChatView;
	selectedChat: string | null;
	selectedChatName: string | null;
	selectedChatType: SidebarChatType;
	selectedDirectChatId?: number | null;
	onOpenChat: (chatId: string, chatName: string, chatType: SidebarChatType) => void;
	onOpenChatPopup: (chatId: string, chatName: string, chatType: SidebarChatType, gameStatus?: GameChatItem["status"]) => void;
	onBackToList: () => void;
	onMessageSent: (chatId: string, message: string, chatType: SidebarChatType) => void;
	chatFilter?: SidebarChatFilter;
	onFilterChange?: (filter: SidebarChatFilter) => void;
	loadingChats?: boolean;
	hasMoreDirectChats?: boolean;
	hasMoreGameChats?: boolean;
	loadingMoreDirectChats?: boolean;
	loadingMoreGameChats?: boolean;
	onLoadMoreDirectChats?: () => Promise<void> | void;
	onLoadMoreGameChats?: () => Promise<void> | void;
	hasUnreadDirect?: boolean;
};

const CHAT_MESSAGES_PAGINATION: Pagination = {
	limit: 50,
	offset: 0
};

// Shared message cache so sidebar chats and popup chats stay in sync
const chatHistoryCache = new Map<string, ChatMessage[]>();
const chatHistoryMetaCache = new Map<string, ChatMeta>();
const chatStoreListeners = new Map<string, Set<(snapshot: ChatStoreSnapshot) => void>>();

const getCachedSnapshot = (key: string): ChatStoreSnapshot => {
	const messages = chatHistoryCache.get(key) ?? [];
	const meta = chatHistoryMetaCache.get(key) ?? { total: messages.length, loaded: messages.length };
	return { messages, meta };
};

// Save messages into cache, remove duplicates, and sort by creation time
const saveMessagesToStore = (key: string, items: ChatMessage[], totalOverride?: number) => {
	const byId = new Map<number, ChatMessage>();

	for (const item of items) {
		byId.set(item.id, item);
	}

	const sorted = Array.from(byId.values()).sort((a, b) => {
		const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
		const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
		const safeATime = Number.isNaN(aTime) ? Date.now() : aTime;
		const safeBTime = Number.isNaN(bTime) ? Date.now() : bTime;

		if (safeATime === safeBTime) {
			return a.id - b.id;
		}

		return safeATime - safeBTime;
	});

	const prevMeta = chatHistoryMetaCache.get(key);
	const nextTotal = Math.max(totalOverride ?? prevMeta?.total ?? sorted.length, sorted.length);
	const meta = { total: nextTotal, loaded: sorted.length };

	chatHistoryCache.set(key, sorted);
	chatHistoryMetaCache.set(key, meta);

	const listeners = chatStoreListeners.get(key);
	if (listeners) {
		const snapshot = { messages: sorted, meta };
		for (const listener of listeners) {
			listener(snapshot);
		}
	}

	return sorted;
};

const Chats = ({
	directChats,
	gameChats,
	chatView,
	selectedChat,
	selectedChatName,
	selectedChatType,
	selectedDirectChatId = null,
	onOpenChat,
	onOpenChatPopup,
	onBackToList,
	onMessageSent,
	chatFilter = "direct",
	onFilterChange,
	loadingChats = false,
	hasMoreDirectChats = false,
	hasMoreGameChats = false,
	loadingMoreDirectChats = false,
	loadingMoreGameChats = false,
	onLoadMoreDirectChats,
	onLoadMoreGameChats,
	hasUnreadDirect = false
}: ChatsProps) => {
	const { t } = useTranslation();
	const { sendMessage, subscribe, isReady } = useWebSocket();
	const { user } = useUser();
	const currentUserId = user?.id;

	const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

	const isRequestingMoreRef = useRef(false);

	// Build icon request map for visible direct chats
	const playerEtags = useMemo(() => {
		return directChats.reduce((acc, chat) => {
			if (chat.user.player?.id > 0 && chat.user.player.iconEtag) {
				acc[chat.user.player.id] = chat.user.player.iconEtag;
			}

			return acc;
		}, {} as Record<number, string>);
	}, [directChats]);

	const playerIcons = usePlayerIcons(playerEtags);

	const selectedGameStatus = selectedChatType === "game" ? gameChats.find((chat) => chat.id.toString() === selectedChat)?.status : undefined;

	const getTimeLabel = (timestamp?: string | Date | null) => {
		if (!timestamp) return "";

		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		if (Number.isNaN(date.getTime())) return "";

		const datePart = date.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
		const timePart = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
		return `${datePart} ${timePart}`;
	};

	const getDirectPreview = (chat: DirectChatItem) => {
		if (!chat.lastMessage) return "";
		if (chat.lastMessage.deletedAt) return t("chat.messageDeleted");

		return chat.lastMessage.message;
	};

	const getGamePreview = (chat: GameChatItem) => {
		return chat.lastMessage?.message ?? "";
	};

	const isDirectChatUnread = useCallback((chat: DirectChatItem) => {
		if (chat.lastMessageRead) return false;
		if (!chat.lastMessage) return true;
		if (!currentUserId) return true;

		return chat.lastMessage.senderId !== currentUserId;
	}, [currentUserId]);

	// Load more chats when the list is scrolled near the bottom
	const handleListScroll = async (e: UIEvent<HTMLDivElement>) => {
		const element = e.currentTarget;
		const isNearBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 80;

		if (!isNearBottom || isRequestingMoreRef.current) return;

		if (chatFilter === "direct") {
			if (!hasMoreDirectChats || loadingMoreDirectChats || !onLoadMoreDirectChats) return;

			isRequestingMoreRef.current = true;
			await Promise.resolve(onLoadMoreDirectChats()).finally(() => {
				isRequestingMoreRef.current = false;
			});
			return;
		}

		if (!hasMoreGameChats || loadingMoreGameChats || !onLoadMoreGameChats) return;

		isRequestingMoreRef.current = true;
		await Promise.resolve(onLoadMoreGameChats()).finally(() => {
			isRequestingMoreRef.current = false;
		});
	};

	// Poll online status for visible direct chat users
	useEffect(() => {
		if (!isReady) return;
		if (chatView !== "list" || chatFilter !== "direct") return;

		const userIds = directChats.map((chat) => chat.user.id);

		if (userIds.length === 0) return;

		void sendMessage({ type: "CHECK_ONLINE", userIds });

		const interval = setInterval(() => {
			void sendMessage({ type: "CHECK_ONLINE", userIds });
		}, 30000);

		return () => clearInterval(interval);
	}, [chatFilter, chatView, directChats, isReady, sendMessage]);

	// Receive online status updates from the websocket
	useEffect(() => {
		const unsubscribe = subscribe((msg: ServerMessage) => {
			if (msg.type === "MARK_ONLINE") {
				setOnlineUserIds(new Set(msg.userIds));
			}
		});

		return unsubscribe;
	}, [subscribe]);

	if (chatView !== "list") {
		return selectedChat ? (
			<Chat
				chatId={selectedChat}
				chatName={selectedChatName || ""}
				chatType={selectedChatType}
				directChatId={selectedDirectChatId}
				gameStatus={selectedGameStatus}
				onBack={onBackToList}
				onMessageSent={onMessageSent}
				onOpenPopup={onOpenChatPopup}
			/>
		) : null;
	}

	return (
		<div className="container chat-list-container">
			<div className="chat-filter-buttons">
				<button
					type="button"
					className={`custom-button ${chatFilter === "direct" ? "active" : ""}`}
					onClick={() => onFilterChange?.("direct")}
				>
					{t("components.sidebar.direct")}
					{hasUnreadDirect && <span className="nav-item-dot" />}
				</button>

				<button
					type="button"
					className={`custom-button ${chatFilter === "game" ? "active" : ""}`}
					onClick={() => onFilterChange?.("game")}
				>
					{t("components.sidebar.game")}
				</button>
			</div>

			{loadingChats ? (
				<div className="loading">{t("common.loading")}</div>
			) : (
				<div className="chat-card-list" onScroll={handleListScroll}>
					{chatFilter === "direct" && directChats.map((chat) => {
						const playerId = chat.user.player?.id;
						const iconSrc = playerId ? playerIcons[playerId] || defaultIcon : defaultIcon;
						const isUnread = isDirectChatUnread(chat);

						return (
							<button
								key={`direct-${chat.user.id}`}
								type="button"
								className={`chat-card ${isUnread ? "unread" : ""}`}
								onClick={() => onOpenChat(chat.user.id.toString(), chat.user.username, "direct")}
							>
								<div className="chat-card-avatar">
									<img
										className="chat-card-avatar-image"
										src={iconSrc}
										alt=""
										onError={(e) => {
											e.currentTarget.src = defaultIcon;
										}}
									/>
								</div>

								<div className="chat-card-main">
									<div className="chat-card-top-row">
										<span className="chat-card-name">{chat.user.username}</span>
										<span className={`chat-card-online-dot ${onlineUserIds.has(chat.user.id) ? "online" : "offline"}`} />
										{isUnread && <span className="chat-card-unread-dot" />}
									</div>

									<div className="chat-card-bottom-row">
										<span className="chat-card-message">{getDirectPreview(chat)}</span>
										<span className="chat-card-time">{getTimeLabel(chat.lastMessage?.createdAt)}</span>
									</div>
								</div>
							</button>
						);
					})}

					{chatFilter === "game" && gameChats.map((chat) => (
						<button
							key={`game-${chat.id}`}
							type="button"
							className="chat-card"
							onClick={() => onOpenChat(chat.id.toString(), chat.gameCode || `Game ${chat.id}`, "game")}
						>
							<div className="chat-card-avatar chat-card-game-avatar">
								<ChatBubbleLeftRightIcon className="chat-card-game-icon" />
							</div>

							<div className="chat-card-main">
								<div className="chat-card-top-row">
									<span className="chat-card-name">{chat.gameCode || `Game ${chat.id}`}</span>
								</div>

								<div className="chat-card-bottom-row">
									<span className="chat-card-message">{getGamePreview(chat)}</span>
									<span className="chat-card-time">{getTimeLabel(chat.lastMessage?.createdAt)}</span>
								</div>
							</div>
						</button>
					))}

					{chatFilter === "direct" && loadingMoreDirectChats && (
						<div className="loading">{t("common.loading")}</div>
					)}

					{chatFilter === "game" && loadingMoreGameChats && (
						<div className="loading">{t("common.loading")}</div>
					)}
				</div>
			)}
		</div>
	);
};

type ChatProps = {
	chatId: string;
	chatName: string;
	chatType: SidebarChatType;
	directChatId?: number | null;
	gameStatus?: GameChatItem["status"];
	onBack: () => void;
	onMessageSent: (chatId: string, message: string, chatType: SidebarChatType) => void;
	onOpenPopup: (chatId: string, chatName: string, chatType: SidebarChatType, gameStatus?: GameChatItem["status"]) => void;
};

const Chat = ({
	chatId,
	chatName,
	chatType,
	directChatId = null,
	gameStatus,
	onBack,
	onMessageSent,
	onOpenPopup
}: ChatProps) => {
	const { t } = useTranslation();
	const { sendMessage, subscribe } = useWebSocket();
	const { user } = useUser();
	const { showPopup } = usePopup();

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputMessage, setInputMessage] = useState("");
	const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
	const [resolvedChatKey, setResolvedChatKey] = useState<string | null>(null);
	const [messagesOffset, setMessagesOffset] = useState(0);
	const [messagesTotal, setMessagesTotal] = useState(0);
	const [gameState, setGameState] = useState<Extract<ServerMessage, { type: "GAME_STATE" }>["data"] | null>(null);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const isRequestingMoreMessagesRef = useRef(false);
	const shouldScrollToBottomRef = useRef(false);
	const wasNearBottomRef = useRef(true);
	const prependScrollRestoreRef = useRef<{ previousScrollTop: number; previousScrollHeight: number } | null>(null);
	const initialBottomSnapChatKeyRef = useRef<string | null>(null);

	const currentUserId = user?.id;
	const currentPlayerId = user?.player?.id;
	const chatKey = `${chatType}:${chatId}`;
	const openGameId = chatType === "game" ? Number.parseInt(chatId, 10) : null;
	const openFriendUserId = chatType === "direct" ? Number.parseInt(chatId, 10) : null;
	const openDirectChatIdRef = useRef<number | null>(directChatId ?? null);

	const isDirectMessage = useCallback((message: ChatMessage): message is ResponseDirectChatMessage => {
		return "chatId" in message;
	}, []);

	// Find the current player's state inside the opened game
	const myGameStatePlayer = useMemo(() => {
		if (chatType !== "game" || !gameState) return null;

		return gameState.players.find((player) => player.playerId === gameState.myPlayerId) ?? null;
	}, [chatType, gameState]);

	// Game chat is only available during allowed phases and while the player is alive
	const canSendGameMessage = useMemo(() => {
		if (chatType !== "game") return true;
		if (gameStatus && gameStatus !== "in_progress") return false;
		if (!gameState || !myGameStatePlayer) return false;
		if (myGameStatePlayer.isEliminated) return false;

		return gameState.currentPhase === "day" || gameState.currentPhase === "voting";
	}, [chatType, gameState, gameStatus, myGameStatePlayer]);

	const resetInput = () => {
		setEditingMessageId(null);
		setInputMessage("");
	};

	// Load the first page of messages or use cached messages if available
	const loadMessages = useCallback(async (force = false) => {
		if (!chatId) return;

		if (!force && chatHistoryCache.has(chatKey)) {
			const snapshot = getCachedSnapshot(chatKey);

			setMessages(snapshot.messages);
			setMessagesOffset(snapshot.meta.loaded);
			setMessagesTotal(snapshot.meta.total);
			setIsLoading(false);
			setIsLoadingMoreMessages(false);
			shouldScrollToBottomRef.current = true;
			setResolvedChatKey(chatKey);
			return;
		}

		setIsLoading(true);
		setIsLoadingMoreMessages(false);
		setMessagesOffset(0);
		setMessagesTotal(0);

		try {
			if (chatType === "direct") {
				const otherUserId = Number.parseInt(chatId, 10);

				if (!Number.isFinite(otherUserId)) {
					return;
				}

				const response = await chatService.getDirectChatMessages(otherUserId, CHAT_MESSAGES_PAGINATION).catch(() => null);
				const items: DirectChatMessagesResponse["data"] = response?.success ? response.result?.data ?? [] : [];
				const total = response?.success ? response.result?.total ?? items.length : items.length;
				const current = chatHistoryCache.get(chatKey) ?? [];

				saveMessagesToStore(chatKey, force ? [...current, ...items] : items, total);
				shouldScrollToBottomRef.current = true;
				return;
			}

			const gameId = Number.parseInt(chatId, 10);

			if (!Number.isFinite(gameId)) {
				return;
			}

			const response = await chatService.getGameChatMessages(gameId, CHAT_MESSAGES_PAGINATION).catch(() => null);
			const items: GameChatMessagesResponse["data"] = response?.success ? response.result?.data ?? [] : [];
			const total = response?.success ? response.result?.total ?? items.length : items.length;
			const current = chatHistoryCache.get(chatKey) ?? [];

			saveMessagesToStore(chatKey, force ? [...current, ...items] : items, total);
			shouldScrollToBottomRef.current = true;
		} finally {
			setIsLoading(false);
			setResolvedChatKey(chatKey);
		}
	}, [chatId, chatKey, chatType]);

	// Load older messages when scrolling near the top
	const loadOlderMessages = useCallback(async () => {
		if (!chatId || isLoading || isRequestingMoreMessagesRef.current) return;

		const snapshot = getCachedSnapshot(chatKey);
		const requestOffset = snapshot.meta.loaded;
		const requestTotal = snapshot.meta.total;

		if (requestTotal > 0 && requestOffset >= requestTotal) return;

		isRequestingMoreMessagesRef.current = true;
		setIsLoadingMoreMessages(true);

		try {
			if (chatType === "direct") {
				const otherUserId = Number.parseInt(chatId, 10);

				if (!Number.isFinite(otherUserId)) {
					return;
				}

				const response = await chatService.getDirectChatMessages(otherUserId, {
					limit: CHAT_MESSAGES_PAGINATION.limit,
					offset: requestOffset
				}).catch(() => null);

				if (response?.success && response.result) {
					const incoming = response.result.data ?? [];
					const total = response.result.total ?? requestTotal;
					const current = chatHistoryCache.get(chatKey) ?? [];

					saveMessagesToStore(chatKey, [...incoming, ...current], total);
				}
				return;
			}

			const gameId = Number.parseInt(chatId, 10);

			if (!Number.isFinite(gameId)) {
				return;
			}

			const response = await chatService.getGameChatMessages(gameId, { limit: CHAT_MESSAGES_PAGINATION.limit, offset: requestOffset }).catch(() => null);
			if (response?.success && response.result) {
				const incoming = response.result.data ?? [];
				const total = response.result.total ?? requestTotal;
				const current = chatHistoryCache.get(chatKey) ?? [];

				saveMessagesToStore(chatKey, [...incoming, ...current], total);
			}
		} finally {
			setIsLoadingMoreMessages(false);
			isRequestingMoreMessagesRef.current = false;
		}
	}, [chatId, chatKey, chatType, isLoading]);

	// Mark a deleted direct message in the local cache
	const markDeletedMessage = useCallback((messageId: number) => {
		const current = chatHistoryCache.get(chatKey) ?? [];

		const next = current.map((message) => {
			if (!isDirectMessage(message) || message.id !== messageId) {
				return message;
			}
			return { ...message, deletedAt: new Date().toISOString(), message: t("chat.messageDeleted") };
		});

		saveMessagesToStore(chatKey, next);
	}, [chatKey, isDirectMessage, t]);

	const formatTimestamp = (timestamp: number) => {
		return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
	};

	// Subscribe this chat component to shared message cache updates
	useEffect(() => {
		const listener = (snapshot: ChatStoreSnapshot) => {
			setMessages(snapshot.messages);
			setMessagesOffset(snapshot.meta.loaded);
			setMessagesTotal(snapshot.meta.total);
		};

		const listeners = chatStoreListeners.get(chatKey) ?? new Set<(snapshot: ChatStoreSnapshot) => void>();

		listeners.add(listener);
		chatStoreListeners.set(chatKey, listeners);

		return () => {
			listeners.delete(listener);

			if (listeners.size === 0) {
				chatStoreListeners.delete(chatKey);
			}
		};
	}, [chatKey]);

	// Keep current direct chat id updated when opening existing direct chats
	useEffect(() => {
		openDirectChatIdRef.current = directChatId ?? null;
	}, [directChatId]);

	// Reset and load messages when the selected chat changes
	useEffect(() => {
		if (!chatId) return;

		initialBottomSnapChatKeyRef.current = null;
		wasNearBottomRef.current = true;

		setIsLoading(true);
		setResolvedChatKey(null);
		setMessages([]);
		setMessagesOffset(0);
		setMessagesTotal(0);
		isRequestingMoreMessagesRef.current = false;
		setIsLoadingMoreMessages(false);
		shouldScrollToBottomRef.current = true;
		void loadMessages(true);
	}, [chatId, chatKey, loadMessages]);

	// Snap to the bottom after the first message render for a chat
	useLayoutEffect(() => {
		const container = messagesContainerRef.current;
		if (!container) return;
		if (isLoading || messages.length === 0) return;
		if (initialBottomSnapChatKeyRef.current === chatKey) return;

		container.scrollTop = container.scrollHeight;
		shouldScrollToBottomRef.current = false;
		initialBottomSnapChatKeyRef.current = chatKey;
	}, [chatKey, isLoading, messages.length]);

	// Clear input and edit mode when changing chats
	useEffect(() => {
		resetInput();
	}, [chatId, chatType]);

	// Request game state when opening a game chat
	useEffect(() => {
		if (chatType !== "game" || openGameId === null || !Number.isFinite(openGameId)) {
			setGameState(null);
			return;
		}

		if (gameStatus !== "in_progress") {
			setGameState(null);
			return;
		}

		void sendMessage({ type: "REQUEST_GAME_STATE" });
	}, [chatType, gameStatus, openGameId, sendMessage]);

	// Mark direct chat as read when it is opened
	useEffect(() => {
		if (chatType !== "direct") return;
		if (openFriendUserId === null || !Number.isFinite(openFriendUserId)) return;

		void sendMessage({
			type: "MARK_DIRECT_CHAT_READ",
			targetUserId: openFriendUserId
		});
	}, [chatType, openFriendUserId, sendMessage]);

	// Handle websocket updates for the currently opened chat
	useEffect(() => {
		const unsubscribe = subscribe((msg: ServerMessage) => {
			switch (msg.type) {
				case "ERROR":
					setIsLoading(false);
					return;

				case "GAME_STATE":
					if (chatType !== "game") return;
					if (openGameId === null || !Number.isFinite(openGameId)) return;
					if (msg.data.gameId !== openGameId) return;

					setGameState(msg.data);
					return;

				case "DIRECT_CHAT_MESSAGE":
				case "DIRECT_CHAT_MESSAGE_EDITED": {
					if (chatType !== "direct") return;
					if (openFriendUserId === null || !Number.isFinite(openFriendUserId)) return;

					const incoming = msg.data;

					const otherUserId = incoming.senderId === currentUserId ? incoming.user?.id : incoming.senderId;
					const fallbackMatchesOpenUser = otherUserId === openFriendUserId;

					if (openDirectChatIdRef.current === null && fallbackMatchesOpenUser) {
						openDirectChatIdRef.current = incoming.chatId;
					}

					const openDirectChatId = openDirectChatIdRef.current;

					const belongsToOpenChat = openDirectChatId ? incoming.chatId === openDirectChatId : fallbackMatchesOpenUser;
					if (!belongsToOpenChat) return;

					saveMessagesToStore(chatKey, [...(chatHistoryCache.get(chatKey) ?? []), incoming]);
					return;
				}

				case "DIRECT_CHAT_MESSAGE_DELETED":
					if (chatType !== "direct") return;

					if (editingMessageId === msg.messageId) {
						resetInput();
					}

					markDeletedMessage(msg.messageId);
					return;

				case "GAME_CHAT_MESSAGE": {
					if (chatType !== "game") return;

					const incoming = msg.data;
					const parsedGameId = Number.parseInt(chatId, 10);

					if (!Number.isFinite(parsedGameId)) return;
					if (incoming.gameId !== parsedGameId) return;

					saveMessagesToStore(chatKey, [...(chatHistoryCache.get(chatKey) ?? []), incoming]);
					setIsLoading(false);
					return;
				}
			}
		});

		return unsubscribe;
	}, [ chatId, chatKey, chatType, currentUserId, editingMessageId, markDeletedMessage, openFriendUserId, openGameId, subscribe ]);

	// Keep scroll position stable when older messages are prepended
	useEffect(() => {
		const container = messagesContainerRef.current;
		if (!container) return;

		if (prependScrollRestoreRef.current) {
			const { previousScrollTop, previousScrollHeight } = prependScrollRestoreRef.current;
			const scrollDelta = container.scrollHeight - previousScrollHeight;

			container.scrollTop = previousScrollTop + scrollDelta;
			prependScrollRestoreRef.current = null;
			return;
		}

		if (shouldScrollToBottomRef.current && !isLoading) {
			container.scrollTop = container.scrollHeight;
			wasNearBottomRef.current = true;
			shouldScrollToBottomRef.current = false;
			return;
		}

		if (wasNearBottomRef.current) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [isLoading, messages]);

	// Trigger older message loading near the top of the message list
	const handleMessagesScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
		const container = e.currentTarget;
		const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 140;
		wasNearBottomRef.current = isNearBottom;
		const isNearTop = container.scrollTop <= 80;

		if (!isNearTop || isLoading || isLoadingMoreMessages || isRequestingMoreMessagesRef.current) return;
		if (messagesTotal > 0 && messagesOffset >= messagesTotal) return;

		prependScrollRestoreRef.current = {
			previousScrollTop: container.scrollTop,
			previousScrollHeight: container.scrollHeight
		};

		void loadOlderMessages();
	}, [isLoading, isLoadingMoreMessages, loadOlderMessages, messagesOffset, messagesTotal]);

	// Send a new message or submit an edit
	const handleSendMessage = async () => {
		const message = inputMessage.trim();

		if (!message) return;
		if (chatType === "game" && !canSendGameMessage) return;

		if (chatType === "direct") {
			const targetUserId = Number.parseInt(chatId, 10);

			if (!Number.isFinite(targetUserId)) return;

			if (editingMessageId !== null) {
				await sendMessage({
					type: "EDIT_DIRECT_CHAT_MESSAGE",
					messageId: editingMessageId,
					message
				});
			} else {
				await sendMessage({
					type: "SEND_DIRECT_CHAT_MESSAGE",
					targetUserId,
					message
				});
				onMessageSent(chatId, message, chatType);
			}
		} else {
			await sendMessage({
				type: "SEND_GAME_CHAT_MESSAGE",
				message
			});
			onMessageSent(chatId, message, chatType);
		}

		resetInput();
	};

	// Show confirmation popup before deleting a direct message
	const handleDeleteMessageConfirm = (messageId: number) => {
		showPopup({
			type: "confirm",
			title: t("chat.delete.confirmTitle"),
			position: "center",
			payload: {
				message: t("chat.delete.confirmMessage"),
				onConfirm: async () => {
					await sendMessage({
						type: "DELETE_DIRECT_CHAT_MESSAGE",
						messageId
					});

					if (editingMessageId === messageId) {
						resetInput();
					}
				}
			}
		});
	};

	// Submit message on Enter
	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== "Enter" || e.shiftKey) return;

		e.preventDefault();
		void handleSendMessage();
	};

	if (resolvedChatKey !== chatKey) {
		return (
			<div className="loading-indicator top-loader">{t("common.loading")}</div>
		);
	}

	return (
		<div className="chat-container">
			<div className="chat-header">
				<div className="chat-header-info">
					<Tooltip content={t("chat.back")} position="right" showDelay={500}>
						<button
							type="button"
							className="chat-header-button"
							onClick={onBack}
							aria-label={t("chat.back")}
						>
							<ArrowLeftIcon className="w-5 h-5" />
						</button>
					</Tooltip>

					<h3 className="chat-header-title">{chatName}</h3>

					{chatType === "game" && (
						<span className="chat-type-indicator">{t("chat.game")}</span>
					)}
				</div>

				<div className="chat-header-buttons">
					<Tooltip content={t("chat.openInPopup")} position="left" showDelay={500}>
						<button className="chat-header-button" onClick={() => onOpenPopup(chatId, chatName, chatType, gameStatus)}>
							<ArrowRightIcon className="w-5 h-5" />
						</button>
					</Tooltip>
				</div>
			</div>

			<div className="chat-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
				{isLoading ? (
					<div className="loading-indicator top-loader">{t("common.loading")}</div>
				) : messages.length === 0 ? (
					<div className="no-messages">{t("chat.noMessages")}</div>
				) : (
					<>
						{isLoadingMoreMessages && (
							<div className="loading-indicator top-loader">{t("common.loading")}</div>
						)}

						{messagesTotal > 0 && messagesOffset >= messagesTotal && (
							<div className="beginning-of-chat">{t("chat.beginning")}</div>
						)}

						{messages.map((message) => {
							const direct = isDirectMessage(message);
							const messageKey = `${direct ? "direct" : "game"}-${message.id}`;
							const isOwn = direct ? message.senderId === currentUserId : message.playerId === currentPlayerId;
							const isSystem = direct ? false : message.messageType === "system";
							const username = direct ? message.user?.username ?? "Unknown" : message.user?.username ?? message.bot?.name ?? "System";
							const content = direct && message.deletedAt ? t("chat.messageDeleted") : message.message;
							const editedAt = direct ? message.editedAt : null;
							const canManageMessage = direct && isOwn && !message.deletedAt;
							const isEditingMessage = direct && editingMessageId === message.id;
							const timestamp = message.createdAt instanceof Date ? message.createdAt.getTime() : new Date(message.createdAt).getTime();

							return (
								<div
									key={messageKey}
									className={`chat-message ${isOwn ? "my-message" : "user-message"} ${isSystem ? "system-message" : ""} ${isEditingMessage ? "editing-message" : ""}`}
								>
									{!isSystem && (
										<div className="message-header">
											<span className="message-username">{username}</span>
											<span className="message-timestamp">{formatTimestamp(Number.isNaN(timestamp) ? Date.now() : timestamp)}</span>
										</div>
									)}

									<div className="message-content">
										<div className="message-content-row">
											<span className="message-text">{content}</span>

											{canManageMessage && (
												<div className="message-actions">
													<Tooltip content={t("chat.actions.edit")} position="top" showDelay={250} hideDelay={200}>
														<button
															type="button"
															className="message-action-button"
															onClick={() => {
																setEditingMessageId(message.id);
																setInputMessage(message.message);
															}}
															aria-label={t("chat.actions.edit")}
														>
															<PencilSquareIcon className="w-4 h-4" />
														</button>
													</Tooltip>

													<Tooltip content={t("chat.actions.delete")} position="top" showDelay={250} hideDelay={200}>
														<button
															type="button"
															className="message-action-button"
															onClick={() => handleDeleteMessageConfirm(message.id)}
															aria-label={t("chat.actions.delete")}
														>
															<TrashIcon className="w-4 h-4" />
														</button>
													</Tooltip>
												</div>
											)}
										</div>

										{!!editedAt && !(direct && message.deletedAt) && (
											<span className="message-edited-label">(edited)</span>
										)}
									</div>
								</div>
							);
						})}

						<div ref={messagesEndRef} />
					</>
				)}
			</div>

			<div className="chat-input">
				<input
					type="text"
					name="chatMessage"
					value={inputMessage}
					onChange={(e) => setInputMessage(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={chatType === "game" && !canSendGameMessage ? t("chat.lockedInput") : t("chat.typeMessage")}
					disabled={isLoading || (chatType === "game" && !canSendGameMessage)}
				/>

				{editingMessageId !== null && (
					<button
						type="button"
						onClick={resetInput}
						className="chat-input-cancel-button"
					>
						{t("common.cancel")}
					</button>
				)}

				<button
					onClick={() => void handleSendMessage()}
					disabled={!inputMessage.trim() || isLoading || (chatType === "game" && !canSendGameMessage)}
				>
					{t("chat.send")}
				</button>
			</div>
		</div>
	);
};

export default Chats;
export { Chat };
