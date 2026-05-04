import { z } from "zod";

export const roleAlignment = ["vampire", "commune", "neutral"] as const;
export type RoleAlignment = (typeof roleAlignment)[number];

export const roleSchema = z.object({
	id: z.number().int(),
	key: z.string(),
	alignment: z.enum(roleAlignment),
	weight: z.number().int()
});

export const createRoleSchema = roleSchema.omit({
	id: true
});

export const responseRolesSchema = z.array(roleSchema);

export type Role = z.infer<typeof roleSchema>;
export type CreateRole = z.infer<typeof createRoleSchema>;

export type ResponseRoles = z.infer<typeof responseRolesSchema>;