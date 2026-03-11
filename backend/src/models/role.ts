import prisma from "../prisma";
import type { Role as RolePrisma, Prisma } from "@prisma/client";
import { Role } from "../types/entities/role";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapRole(r: RolePrisma): Role {
		return {
			id: r.id,
			key: r.key,
			alignment: r.alignment,
			weight: r.weight,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		};
	}
}

export const RoleModel = new Model(prisma);
export const RoleModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);