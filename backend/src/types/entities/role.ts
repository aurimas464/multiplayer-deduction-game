import { z } from "zod";

export const roleAlignment = ["vampire", "commune", "neutral"] as const;

export const roleSchema = z.object({
	id: z.number().int(),
	key: z.string(),
	alignment: z.enum(roleAlignment),
	weight: z.number().int(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
}).strip();

export type Role = z.infer<typeof roleSchema>;

export const responseRoleSchema = roleSchema.omit({
	createdAt: true,
	updatedAt: true,
}).strip();

export type ResponseRole = z.infer<typeof responseRoleSchema>;

export const responseRolesSchema = z.array(responseRoleSchema);