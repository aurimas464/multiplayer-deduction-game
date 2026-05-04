import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { ChatBubbleLeftRightIcon, UserPlusIcon, CheckIcon, XMarkIcon, UserMinusIcon, NoSymbolIcon, MagnifyingGlassIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "../../hooks/useTranslation";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { useUser } from "../../contexts/UserContext";
import { usePopup } from "../../contexts/PopupContext";
import { friendshipService } from "../../services/friendship";
import { ErrorCode } from "../../types";
import { useWebSocketNotifyWithLoading } from "../../hooks/useWebSocketNotifyWithLoading";
import { usePlayerIcons } from "../../hooks/usePlayerIcons";
import { Tooltip } from "../Tooltip";
import defaultIcon from "../../assets/default-user-icon.png";
import type { Pagination } from "../../types";
import type { BlockedUsersResponse, FriendsTabs, FriendsResponse, PendingFriendRequestsResponse, SentFriendRequestsResponse } from "../../types/friendship";
import type { ResponseUser, ServerMessage } from "../../types/websocket";
import "../../css/friends.css";

const BLOCKED_USERS_PAGE_SIZE = 20;

const BLOCKED_USERS_PAGINATION: Pagination = {
	limit: BLOCKED_USERS_PAGE_SIZE,
	offset: 0
};

type Props = {
	onStartFriendChat: (friendId: string, friendName: string) => void;
};

const Friends = ({ onStartFriendChat }: Props) => {
	const { t } = useTranslation();
	const { subscribe, sendMessage } = useWebSocket();
	const { user } = useUser();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();
	const { showPopup } = usePopup();

	const [activeTab, setActiveTab] = useState<FriendsTabs>("friends");
	const [searchInput, setSearchInput] = useState("");
	const [friendFilter, setFriendFilter] = useState("");
	const [debouncedFriendFilter, setDebouncedFriendFilter] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const [friends, setFriends] = useState<ResponseUser[]>([]);
	const [pendingRequests, setPendingRequests] = useState<ResponseUser[]>([]);
	const [sentRequests, setSentRequests] = useState<ResponseUser[]>([]);
	const [blockedUsers, setBlockedUsers] = useState<ResponseUser[]>([]);
	const [blockedUsersTotal, setBlockedUsersTotal] = useState(0);
	const [blockedUsersOffset, setBlockedUsersOffset] = useState(0);
	const [isLoadingMoreBlocked, setIsLoadingMoreBlocked] = useState(false);
	const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

	const loadedFriendsTabRef = useRef(false);
	const loadedPendingTabRef = useRef(false);
	const actionLock = useRef(false);
	const inviteLock = useRef(false);
	const blockedRequestIdRef = useRef(0);
	const isBlockedScrollLoadingRef = useRef(false);

	const sortByName = useCallback((items: ResponseUser[]) => {
		return [...items].sort((a, b) => a.username.localeCompare(b.username));
	}, []);

	const filteredFriends = useMemo(() => {
		const query = debouncedFriendFilter.trim().toLowerCase();
		const filtered = query ? friends.filter((friend) => friend.username.toLowerCase().includes(query)) : friends;

		return [...filtered].sort((a, b) => {
			const aOnline = onlineUserIds.has(a.id);
			const bOnline = onlineUserIds.has(b.id);
			if (aOnline === bOnline) {
				return a.username.localeCompare(b.username);
			}
			return aOnline ? -1 : 1;
		});
	}, [debouncedFriendFilter, friends, onlineUserIds]);

	const filteredPendingRequests = useMemo(() => {
		const query = debouncedFriendFilter.trim().toLowerCase();

		if (!query) return pendingRequests;

		return pendingRequests.filter((request) => request.username.toLowerCase().includes(query));
	}, [debouncedFriendFilter, pendingRequests]);

	const filteredSentRequests = useMemo(() => {
		const query = debouncedFriendFilter.trim().toLowerCase();

		if (!query) return sentRequests;

		return sentRequests.filter((request) => request.username.toLowerCase().includes(query));
	}, [debouncedFriendFilter, sentRequests]);

	const fetchFriendsTabData = useCallback(async () => {
		setIsLoading(true);

		try {
			const friendsRes = await friendshipService.getFriends().catch(() => null);

			if (friendsRes?.success) {
				const friendsResult: FriendsResponse = friendsRes.result ?? [];
				setFriends(sortByName(friendsResult));
			} else {
				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message: t("friends.error.fetchFriends") },
					autoCloseDelay: 5000
				});
			}
		} finally {
			setIsLoading(false);
		}
	}, [showPopup, sortByName, t]);

	const fetchReceivedRequests = useCallback(async () => {
		const response = await friendshipService.getPendingRequests().catch(() => null);

		if (response?.success) {
			const pendingResult: PendingFriendRequestsResponse = response.result ?? [];
			setPendingRequests(sortByName(pendingResult));
		} else {
			showPopup({
				type: "error",
				title: t("common.error"),
				payload: { message: t("friends.error.fetchPendingRequests") },
				autoCloseDelay: 5000
			});
		}

	}, [showPopup, sortByName, t]);

	useEffect(() => {
		if (!user) {
			loadedFriendsTabRef.current = false;
			loadedPendingTabRef.current = false;
			setFriends([]);
			setPendingRequests([]);
			setSentRequests([]);
			return;
		}

		const timer = window.setTimeout(() => void fetchReceivedRequests(), 0);

		return () => window.clearTimeout(timer);
	}, [fetchReceivedRequests, user]);

	const fetchPendingTabData = useCallback(async () => {
		setIsLoading(true);

		try {
			const response = await friendshipService.getSentRequests().catch(() => null);

			if (response?.success) {
				const sentResult: SentFriendRequestsResponse = response.result ?? [];
				setSentRequests(sortByName(sentResult));
			} else {
				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message: t("friends.error.fetchSentRequests") },
					autoCloseDelay: 5000
				});
			}
		} finally {
			setIsLoading(false);
		}
	}, [showPopup, sortByName, t]);

	// Blocked uses pagination as there shouldnt be a limit to blocks, others are have a static max so they are allowed to fetch all
	const fetchBlockedUsers = useCallback(async (offset: number, reset = false) => {
		if (reset) {
			blockedRequestIdRef.current += 1;
		}

		const requestId = blockedRequestIdRef.current;

		if (reset) {
			setIsLoading(true);
			setBlockedUsers([]);
			setBlockedUsersTotal(0);
			setBlockedUsersOffset(0);
		} else {
			if (isBlockedScrollLoadingRef.current) return;

			isBlockedScrollLoadingRef.current = true;
			setIsLoadingMoreBlocked(true);
		}

		const pagination: Pagination = { ...BLOCKED_USERS_PAGINATION, offset };

		try {
			const username = debouncedFriendFilter.trim() || undefined;
			const response = await friendshipService.getBlockedUsers(pagination, username).catch(() => null);

			if (requestId !== blockedRequestIdRef.current) return;

			if (response?.success && response.result) {
				const blockedData: BlockedUsersResponse = response.result;
				const incoming = blockedData.data ?? [];
				const responseOffset = blockedData.offset ?? offset;
				const nextOffset = responseOffset + incoming.length;

				if (reset) {
					setBlockedUsers(incoming);
					setBlockedUsersTotal(blockedData.total ?? incoming.length);
					setBlockedUsersOffset(nextOffset);
				} else {
					setBlockedUsers((prev) => {
						const byId = new Map<number, ResponseUser>();

						for (const blocked of prev) {
							byId.set(blocked.id, blocked);
						}

						for (const blocked of incoming) {
							byId.set(blocked.id, blocked);
						}

						return Array.from(byId.values());
					});

					setBlockedUsersTotal(blockedData.total ?? 0);
					setBlockedUsersOffset(nextOffset);
				}
			} else {
				showPopup({
					type: "error",
					title: t("common.error"),
					payload: { message: t("friends.error.fetchBlockedUsers") },
					autoCloseDelay: 5000
				});
			}
		} finally {
			if (reset) {
				setIsLoading(false);
			} else {
				setIsLoadingMoreBlocked(false);
				isBlockedScrollLoadingRef.current = false;
			}
		}
	}, [debouncedFriendFilter, showPopup, t]);

	// Wait before filtering
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedFriendFilter(friendFilter);
		}, 500);

		return () => clearTimeout(timer);
	}, [friendFilter]);

	useEffect(() => {
		if (!user) return;

		if (activeTab === "friends" && !loadedFriendsTabRef.current) {
			const timer = window.setTimeout(() => {
				loadedFriendsTabRef.current = true;
				void fetchFriendsTabData();
			}, 0);
			return () => window.clearTimeout(timer);
		}

		if (activeTab === "pending" && !loadedPendingTabRef.current) {
			const timer = window.setTimeout(() => {
				loadedPendingTabRef.current = true;
				void fetchPendingTabData();
			}, 0);
			return () => window.clearTimeout(timer);
		}
	}, [activeTab, fetchFriendsTabData, fetchPendingTabData, user]);

	// Blocked tabs use fetch
	useEffect(() => {
		if (!user || activeTab !== "blocked") return;

		const timer = window.setTimeout(() => void fetchBlockedUsers(0, true), 0);

		return () => window.clearTimeout(timer);
	}, [activeTab, debouncedFriendFilter, fetchBlockedUsers, user]);

	// Refresh online markers
	useEffect(() => {
		const userIds = friends.map((friend) => friend.id);

		if (userIds.length === 0) return;

		void sendMessage({ type: "CHECK_ONLINE", userIds });

		const interval = setInterval(() => {
			void sendMessage({ type: "CHECK_ONLINE", userIds });
		}, 30000);

		return () => clearInterval(interval);
	}, [friends, sendMessage]);

	// Get player icons if needed
	const playerEtags = useMemo(() => {
		return friends.reduce((acc, friend) => {
			if (friend.player?.id > 0 && friend.player.iconEtag) {
				acc[friend.player.id] = friend.player.iconEtag;
			}

			return acc;
		}, {} as Record<number, string>);
	}, [friends]);
	const playerIcons = usePlayerIcons(playerEtags);

	// Listen for changes
	useEffect(() => {
		const unsubscribe = subscribe((msg: ServerMessage) => {
			switch (msg.type) {
				case "MARK_ONLINE":
					setOnlineUserIds(new Set(msg.userIds));
					return;
				case "FRIEND_REQUEST_RECEIVED": {
					const incoming: ResponseUser = msg.fromUser;

					setPendingRequests((prev) =>
						prev.some((item) => item.id === incoming.id)
							? prev
							: sortByName([...prev, incoming])
					);
					return;
				}
				case "FRIEND_REQUEST_CANCELLED":
					setPendingRequests((prev) => prev.filter((item) => item.id !== msg.fromUserId));
					return;
				case "FRIEND_REQUEST_ACCEPTED": {
					const accepted: ResponseUser = msg.fromUser;

					setSentRequests((prev) => prev.filter((item) => item.id !== accepted.id));
					setFriends((prev) => sortByName([...prev.filter((item) => item.id !== accepted.id), accepted]));
					return;
				}
				case "FRIEND_REQUEST_REJECTED":
					setSentRequests((prev) => prev.filter((item) => item.id !== msg.fromUserId));
					return;
				case "FRIEND_REMOVED_YOU":
					setFriends((prev) => prev.filter((item) => item.id !== msg.fromUserId));
					return;
				case "USER_BLOCKED_YOU": {
					const blockedBy: ResponseUser = msg.fromUser;

					setFriends((prev) => prev.filter((item) => item.id !== blockedBy.id));
					setPendingRequests((prev) => prev.filter((item) => item.id !== blockedBy.id));
					setSentRequests((prev) => prev.filter((item) => item.id !== blockedBy.id));
					return;
				}
			}
		});

		return unsubscribe;
	}, [sortByName, subscribe]);

	const handleSendFriendRequest = () => {
		const targetUsername = searchInput.trim();
		if (!targetUsername) return;

		notifyWithLoading(
			{ type: "SEND_FRIEND_REQUEST", targetUsername },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST ||
					msg.code === ErrorCode.FRIENDSHIP_ALREADY_EXISTS ||
					msg.code === ErrorCode.FRIENDSHIP_ALREADY_SENT ||
					msg.code === ErrorCode.USER_BLOCKED ||
					msg.code === ErrorCode.FRIENDS_LIMIT_REACHED ||
					msg.code === ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED ||
					msg.code === ErrorCode.FRIEND_REQUEST_INCOMING_LIMIT_REACHED
				),
				successOn: (msg) => msg.type === "SEND_FRIEND_REQUEST_OK" && msg.targetUser.username === targetUsername,
				onSuccess: (msg) => {
					if (msg.type !== "SEND_FRIEND_REQUEST_OK") return;

					const sent = msg.targetUser;

					setSentRequests((prev) =>
						prev.some((item) => item.id === sent.id)
							? prev
							: sortByName([...prev, sent])
					);

					showPopup({
						type: "success",
						title: t("friends.success.friendRequestSent"),
						payload: { message: t("friends.success.friendRequestSentMessage", { username: sent.username }) },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);

		setSearchInput("");
	};

	const handleAcceptRequest = (requestUserId: string) => {
		const userId = Number.parseInt(requestUserId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "ACCEPT_FRIEND_REQUEST", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST ||
					msg.code === ErrorCode.FRIENDS_LIMIT_REACHED
				),
				successOn: (msg) => msg.type === "ACCEPT_FRIEND_REQUEST_OK" && msg.targetUser.id === userId,
				onSuccess: (msg) => {
					if (msg.type !== "ACCEPT_FRIEND_REQUEST_OK") return;

					const accepted = msg.targetUser;

					setPendingRequests((prev) => prev.filter((item) => item.id !== accepted.id));
					setFriends((prev) => sortByName([...prev.filter((item) => item.id !== accepted.id), accepted]));

					showPopup({
						type: "success",
						title: t("friends.success.friendRequestAccepted"),
						payload: { message: t("friends.success.friendRequestAcceptedMessage", { username: accepted.username }) },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleRejectRequest = (requestUserId: string) => {
		const userId = Number.parseInt(requestUserId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "REJECT_FRIEND_REQUEST", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST
				),
				successOn: (msg) => msg.type === "REJECT_FRIEND_REQUEST_OK" && msg.targetUserId === userId,
				onSuccess: (msg) => {
					if (msg.type !== "REJECT_FRIEND_REQUEST_OK") return;

					setPendingRequests((prev) => prev.filter((item) => item.id !== msg.targetUserId));

					showPopup({
						type: "success",
						title: t("friends.success.friendRequestRejected"),
						payload: { message: t("friends.success.friendRequestRejectedMessage") },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleCancelSentRequest = (targetUserId: string) => {
		const userId = Number.parseInt(targetUserId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "CANCEL_FRIEND_REQUEST", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST
				),
				successOn: (msg) => msg.type === "CANCEL_FRIEND_REQUEST_OK" && msg.targetUserId === userId,
				onSuccess: (msg) => {
					if (msg.type !== "CANCEL_FRIEND_REQUEST_OK") return;

					setSentRequests((prev) => prev.filter((item) => item.id !== msg.targetUserId));

					showPopup({
						type: "success",
						title: t("friends.success.friendRequestCancelled"),
						payload: { message: t("friends.success.friendRequestCancelledMessage") },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleUnfriend = (friendId: string) => {
		const userId = Number.parseInt(friendId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "REMOVE_FRIEND", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST
				),
				successOn: (msg) => msg.type === "REMOVE_FRIEND_OK" && msg.targetUserId === userId,
				onSuccess: (msg) => {
					if (msg.type !== "REMOVE_FRIEND_OK") return;

					setFriends((prev) => prev.filter((item) => item.id !== msg.targetUserId));

					showPopup({
						type: "success",
						title: t("friends.success.friendRemoved"),
						payload: { message: t("friends.success.friendRemovedMessage") },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleBlock = (friendId: string) => {
		const userId = Number.parseInt(friendId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "BLOCK_USER", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST
				),
				successOn: (msg) => msg.type === "BLOCK_USER_OK" && msg.targetUser.id === userId,
				onSuccess: (msg) => {
					if (msg.type !== "BLOCK_USER_OK") return;

					const blocked = msg.targetUser;

					setFriends((prev) => prev.filter((item) => item.id !== blocked.id));
					setPendingRequests((prev) => prev.filter((item) => item.id !== blocked.id));
					setSentRequests((prev) => prev.filter((item) => item.id !== blocked.id));

					setBlockedUsers((prev) => {
						if (prev.some((item) => item.id === blocked.id)) {
							return prev;
						}

						if (activeTab === "blocked") {
							setBlockedUsersTotal((total) => total + 1);
							setBlockedUsersOffset((offset) => offset + 1);
						}

						return sortByName([...prev, blocked]);
					});

					showPopup({
						type: "success",
						title: t("friends.success.userBlocked"),
						payload: { message: t("friends.success.userBlockedMessage", { username: blocked.username }) },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleUnblock = (blockedUserId: string) => {
		const userId = Number.parseInt(blockedUserId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "UNBLOCK_USER", userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.USER_NOT_FOUND ||
					msg.code === ErrorCode.INVALID_REQUEST
				),
				successOn: (msg) => msg.type === "UNBLOCK_USER_OK" && msg.targetUserId === userId,
				onSuccess: (msg) => {
					if (msg.type !== "UNBLOCK_USER_OK") return;

					setBlockedUsers((prev) => {
						const updated = prev.filter((item) => item.id !== msg.targetUserId);

						if (activeTab === "blocked" && prev.length > updated.length) {
							setBlockedUsersTotal((total) => Math.max(0, total - 1));
							setBlockedUsersOffset((offset) => Math.max(0, offset - 1));
						}

						return updated;
					});

					showPopup({
						type: "success",
						title: t("friends.success.userUnblocked"),
						payload: { message: t("friends.success.userUnblockedMessage") },
						autoCloseDelay: 5000
					});
				}
			},
			actionLock
		);
	};

	const handleInviteToGame = (targetUserId: string) => {
		const userId = Number.parseInt(targetUserId, 10);
		if (!Number.isFinite(userId)) return;

		notifyWithLoading(
			{ type: "INVITE_TO_GAME", targetUserId: userId },
			{
				rejectOn: (msg) => msg.type === "ERROR" && (
					msg.code === ErrorCode.UNAUTHORIZED ||
					msg.code === ErrorCode.USER_NOT_FRIEND ||
					msg.code === ErrorCode.GAME_NOT_FOUND ||
					msg.code === ErrorCode.GAME_ALREADY_STARTED
				),
				successOn: (msg) => msg.type === "INVITE_TO_GAME_OK" && msg.targetUserId === userId,
				onSuccess: () => {
					showPopup({
						type: "success",
						title: t("friends.success.inviteSent"),
						payload: { message: t("friends.success.inviteSentMessage") },
						autoCloseDelay: 5000
					});
				}
			},
			inviteLock
		);
	};

	const handleUnfriendConfirm = (friendId: string, username: string) => {
		showPopup({
			type: "confirm",
			title: t("friends.confirm.unfriendTitle"),
			position: "center",
			payload: {
				message: t("friends.confirm.unfriendMessage", { username }),
				onConfirm: () => handleUnfriend(friendId)
			}
		});
	};

	const handleCancelSentRequestConfirm = (targetUserId: string, username: string) => {
		showPopup({
			type: "confirm",
			title: t("friends.confirm.cancelRequestTitle"),
			position: "center",
			payload: {
				message: t("friends.confirm.cancelRequestMessage", { username }),
				onConfirm: () => handleCancelSentRequest(targetUserId)
			}
		});
	};

	const handleBlockConfirm = (friendId: string, username: string) => {
		showPopup({
			type: "confirm",
			title: t("friends.confirm.blockTitle"),
			position: "center",
			payload: {
				message: t("friends.confirm.blockMessage", { username }),
				onConfirm: () => handleBlock(friendId)
			}
		});
	};

	const handleUnblockConfirm = (blockedUserId: string, username: string) => {
		showPopup({
			type: "confirm",
			title: t("friends.confirm.unblockTitle"),
			position: "center",
			payload: {
				message: t("friends.confirm.unblockMessage", { username }),
				onConfirm: () => handleUnblock(blockedUserId)
			}
		});
	};

	const handleBlockedScroll = (e: UIEvent<HTMLDivElement>) => {
		const element = e.currentTarget;
		const isNearBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;

		if (!isNearBottom) return;
		if (blockedUsers.length === 0) return;
		if (blockedUsers.length >= blockedUsersTotal) return;
		if (isLoadingMoreBlocked || isBlockedScrollLoadingRef.current) return;

		void fetchBlockedUsers(blockedUsersOffset, false);
	};

	const hasReceivedRequests = filteredPendingRequests.length > 0;

	return (
		<div className="container">
			<div className="friends-tabs">
				<button
					className={`custom-button ${activeTab === "friends" ? "active" : ""}`}
					onClick={() => setActiveTab("friends")}
				>
					{t("components.sidebar.friends")}
				</button>

				<button
					className={`custom-button ${activeTab === "pending" ? "active" : ""}`}
					onClick={() => setActiveTab("pending")}
				>
					{t("friends.pendingRequests")}
				</button>

				<button
					className={`custom-button ${activeTab === "blocked" ? "active" : ""}`}
					onClick={() => setActiveTab("blocked")}
				>
					{t("friends.blockedUsers.showBlockedUsers")}
				</button>
			</div>

			<div className="friend-search">
				<input
					type="text"
					name="friendSearch"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					placeholder={t("friends.search.placeholder")}
					onKeyDown={(e) => e.key === "Enter" && handleSendFriendRequest()}
				/>

				<Tooltip content={t("friends.sendRequest")} position="right" showDelay={500}>
					<button
						type="button"
						onClick={handleSendFriendRequest}
						disabled={!searchInput.trim()}
						aria-label={t("friends.sendRequest")}
					>
						<UserPlusIcon className="w-5 h-5" />
					</button>
				</Tooltip>
			</div>

			<div className="friend-filter">
				<MagnifyingGlassIcon className="filter-icon" />

				<input
					type="text"
					name="friendFilter"
					value={friendFilter}
					onChange={(e) => setFriendFilter(e.target.value)}
					placeholder={t("friends.search.friendsFilter")}
				/>
			</div>

			{isLoading ? (
				<div className="loading">{t("common.loading")}</div>
			) : (
				<>
					{hasReceivedRequests && (
						<div className="friends-request-section">
							<div className="friends-section-title">{t("friends.receivedRequests")}</div>

							<div className="friends-card-list">
								{filteredPendingRequests.map((request) => (
									<div key={request.id.toString()} className="friend-card-item">
										<div className="request-name">{request.username}</div>

										<div className="request-actions">
											<Tooltip content={t("friends.accept")} position="top" showDelay={500}>
												<button className="accept-button" onClick={() => handleAcceptRequest(request.id.toString())}>
													<CheckIcon className="w-4 h-4" />
												</button>
											</Tooltip>

											<Tooltip content={t("friends.reject")} position="top" showDelay={500}>
												<button className="reject-button friend-action-button-danger" onClick={() => handleRejectRequest(request.id.toString())}>
													<XMarkIcon className="w-4 h-4" />
												</button>
											</Tooltip>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{activeTab === "friends" && (
						<div className="friends-card-list">
							{filteredFriends.map((friend) => (
								<div key={friend.id.toString()} className="friend-card-item">
									<div className="friend-name friend-name-row">
										<img
											className="friend-mini-icon"
											src={(friend.player?.id ? playerIcons[friend.player.id] : undefined) || defaultIcon}
											alt=""
											onError={(e) => {
												e.currentTarget.src = defaultIcon;
											}}
										/>

										<span>{friend.username}</span>
										<span className={`friend-online-dot ${onlineUserIds.has(friend.id) ? "online" : "offline"}`} />
									</div>

									<div className="friend-actions">
										<Tooltip content={t("friends.actions.chat")} position="top" showDelay={500}>
											<button className="friend-action-button" onClick={() => onStartFriendChat(friend.id.toString(), friend.username)}>
												<ChatBubbleLeftRightIcon className="w-4 h-4" />
											</button>
										</Tooltip>

										<Tooltip content={t("friends.actions.inviteToGame")} position="top" showDelay={500}>
											<button className="friend-action-button" onClick={() => handleInviteToGame(friend.id.toString())}>
												<PaperAirplaneIcon className="w-4 h-4" />
											</button>
										</Tooltip>

										<Tooltip content={t("friends.actions.unfriend")} position="top" showDelay={500}>
											<button className="friend-action-button friend-action-button-danger" onClick={() => handleUnfriendConfirm(friend.id.toString(), friend.username)}>
												<UserMinusIcon className="w-4 h-4" />
											</button>
										</Tooltip>

										<Tooltip content={t("friends.actions.block")} position="top" showDelay={500}>
											<button className="friend-action-button friend-action-button-danger" onClick={() => handleBlockConfirm(friend.id.toString(), friend.username)}>
												<NoSymbolIcon className="w-4 h-4" />
											</button>
										</Tooltip>
									</div>
								</div>
							))}

							{filteredFriends.length === 0 && !hasReceivedRequests && (
								<div className="no-friends">{t("friends.noFriends")}</div>
							)}
						</div>
					)}

					{activeTab === "pending" && (
						<div className="friends-card-list">
							{filteredSentRequests.map((request) => (
								<div key={request.id.toString()} className="friend-card-item">
									<div className="request-name">{request.username}</div>

									<div className="request-actions">
										<Tooltip content={t("friends.cancel")} position="top" showDelay={500}>
											<button className="reject-button friend-action-button-danger" onClick={() => handleCancelSentRequestConfirm(request.id.toString(), request.username)}>
												<XMarkIcon className="w-4 h-4" />
											</button>
										</Tooltip>
									</div>
								</div>
							))}

							{!hasReceivedRequests && filteredSentRequests.length === 0 && (
								<div className="no-friends">{t("friends.noFriends")}</div>
							)}
						</div>
					)}

					{activeTab === "blocked" && (
						<div className="friends-card-list" onScroll={handleBlockedScroll}>
							{blockedUsers.map((blocked) => (
								<div key={blocked.id.toString()} className="friend-card-item blocked">
									<div className="request-name">{blocked.username}</div>

									<div className="request-actions">
										<Tooltip content={t("friends.actions.unblock")} position="top" showDelay={500}>
											<button className="reject-button friend-action-button-danger" onClick={() => handleUnblockConfirm(blocked.id.toString(), blocked.username)}>
												<NoSymbolIcon className="w-4 h-4" />
											</button>
										</Tooltip>
									</div>
								</div>
							))}

							{blockedUsers.length === 0 && !hasReceivedRequests && (
								<div className="no-friends">{t("friends.noFriends")}</div>
							)}

							{isLoadingMoreBlocked && (
								<div className="loading">{t("common.loading")}</div>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
};

export default Friends;
