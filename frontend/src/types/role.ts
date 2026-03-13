export const roleAlignment = ["vampire", "commune", "neutral"] as const;
export type RoleAlignment = (typeof roleAlignment)[number];

export type Role = {
	id: number;
	key: string;
	alignment: RoleAlignment;
	weight: number;
};