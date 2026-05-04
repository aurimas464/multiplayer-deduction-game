import prisma from "../../prisma/client";
import type { Role as RolePrisma, Prisma } from "@prisma/client";
import { Role, CreateRole } from "../types/entities/role";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapRole(role: RolePrisma): Role {
		return {
			id: role.id,
			key: role.key,
			alignment: role.alignment,
			weight: role.weight
		};
	}

	async upsert(data: CreateRole): Promise<Role> {
		const row = await this.db.role.upsert({
			where: { key: data.key },
			update: {
				alignment: data.alignment,
				weight: data.weight
			},
			create: data
		});

		return this.mapRole(row);
	}

	async listRoles(): Promise<Role[]> {
		const rows = await this.db.role.findMany({
			orderBy: [
				{ alignment: "asc" },
				{ id: "asc" }
			]
		});

		return rows.map((row) => this.mapRole(row));
	}
}

export const RoleModel = new Model(prisma);
export const RoleModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);