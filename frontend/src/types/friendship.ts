import type { PaginatedResult } from "./index";
import type { ResponseUser } from "./websocket";

export type FriendsResponse = ResponseUser[];
export type PendingFriendRequestsResponse = ResponseUser[];
export type SentFriendRequestsResponse = ResponseUser[];
export type BlockedUsersResponse = PaginatedResult<ResponseUser>;
export type HasPendingRequestsResponse = boolean;

export type FriendsTabs = "friends" | "pending" | "blocked";
