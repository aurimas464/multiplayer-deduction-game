import type { PaginatedResult } from "./index";
import type { ResponseDirectChatMessage, ResponseGameChatMessage, ResponsePlayer } from "./websocket";
import type { GameStatus } from "./websocket";
import type { ResponseUser } from "./websocket";

export type DirectChatItem = {
	id: number;
	friendshipId: number;
	lastMessageRead: boolean;
	lastMessage: {
		senderId: number;
		message: string;
		editedAt: Date | string | null;
		deletedAt: Date | string | null;
		createdAt: Date | string;
	} | null;
	user: ResponseUser;
};

export type GameChatItem = {
	id: number;
	gameCode: string;
	status: typeof GameStatus[number];
	lastMessage: {
		playerId: number | null;
		message: string;
		messageType: "player" | "system" | "bot";
		dayNumber: number;
		phase: "day" | "voting" | "night";
		createdAt?: Date | string | null;
	} | null;
	user: ResponseUser | null;
	bot: {
		id: number;
		name: string;
		player: ResponsePlayer;
	};
};

export type DirectChatsResponse = PaginatedResult<DirectChatItem>;
export type GameChatsResponse = PaginatedResult<GameChatItem>;
export type DirectChatMessagesResponse = PaginatedResult<ResponseDirectChatMessage>;
export type GameChatMessagesResponse = PaginatedResult<ResponseGameChatMessage>;

export type SidebarChatView = "list" | "chat";
export type SidebarChatFilter = "direct" | "game";
export type SidebarChatType = "direct" | "game";

export type ChatMessage = ResponseDirectChatMessage | ResponseGameChatMessage;

export type ChatMeta = {
	total: number;
	loaded: number;
};

export type ChatStoreSnapshot = {
	messages: ChatMessage[];
	meta: ChatMeta;
};
