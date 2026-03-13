import prisma from "../../prisma/client";
import type { Prisma, User as PrismaUser } from "@prisma/client";

import { User } from "../types/entities/user";
import { UserRegisterDTO } from "../types/controllers/auth";
import { UserUpdateDTO } from "../types/controllers/user";
import { ResponseUser } from "../types/entities/user";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapUser(user: PrismaUser): User {
		return {
			id: user.id,
			username: user.username,
			email: user.email,
			theme: user.theme,
			colorTheme: user.colorTheme,
			language: user.language,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		};
	}

	async findById(id: number): Promise<User | null> {
		const user = await this.db.user.findUnique({ where: { id } });
		return user ? this.mapUser(user) : null;
	}

	async findByUsername(username: string): Promise<User | null> {
		const user = await this.db.user.findUnique({ where: { username } });
		return user ? this.mapUser(user) : null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const user = await this.db.user.findUnique({ where: { email } });
		return user ? this.mapUser(user) : null;
	}

	async findByEmailOrName(login: string): Promise<User | null> {
		const user = await this.db.user.findFirst({
			where: { OR: [{ email: login }, { username: login }] },
		});
		return user ? this.mapUser(user) : null;
	}

	async findPasswordById(id: number): Promise<{ id: number; password: string } | null> {
		return this.db.user.findUnique({
			where: { id },
			select: { id: true, password: true },
		});
	}

	async findByIds(ids: number[]): Promise<User[]> {
		if (ids.length === 0) return [];

		const users = await this.db.user.findMany({
			where: { id: { in: ids } },
		});

		return users.map((u) => this.mapUser(u));
	}

	async create(user: UserRegisterDTO): Promise<ResponseUser> {
		const createdUser = await this.db.user.create({
			data: {
				username: user.username,
				email: user.email,
				password: user.password,
			},
		});

		const createdPlayer = await this.db.player.create({
			data: {
				type: "user",
				user: { create: { userId: createdUser.id } },
			},
		});

		return { player: createdPlayer, ...createdUser };
	}

	async update(id: number, update: UserUpdateDTO, iconEtag?: string): Promise<boolean> {
		const userData: Record<string, unknown> = {};
		if (update.username !== undefined) userData.username = update.username;
		if (update.email !== undefined) userData.email = update.email;
		if (update.password !== undefined) userData.password = update.password;
		if (update.theme !== undefined && update.theme !== null) userData.theme = update.theme;
		if (update.colorTheme !== undefined && update.colorTheme !== null) userData.colorTheme = update.colorTheme;
		if (update.language !== undefined && update.language !== null) userData.language = update.language;

		const playerData: Record<string, unknown> = {};
		if (update.icon !== undefined) {
			playerData.icon = update.icon;
			if (iconEtag !== undefined) {
				playerData.iconEtag = iconEtag;
			}
		}

		const shouldUpdateUser = Object.keys(userData).length > 0;
		const shouldUpdatePlayer = Object.keys(playerData).length > 0;

		if (!shouldUpdateUser && !shouldUpdatePlayer) return true;

		const existingUser = await this.db.user.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!existingUser) return false;

		if (shouldUpdateUser) {
			await this.db.user.update({
				where: { id },
				data: userData,
			});
		}

		if (shouldUpdatePlayer) {
			const existingUserPlayer = await this.db.userPlayer.findUnique({
				where: { userId: id },
				select: { playerId: true },
			});
			if (!existingUserPlayer) return false;

			await this.db.player.update({
				where: { id: existingUserPlayer.playerId },
				data: playerData,
			});
		}

		return true;
	}

	async delete(id: number): Promise<boolean> {
		await this.db.user.delete({ where: { id } });
		return true;
	}
}

export const UserModel = new Model(prisma);
export const UserModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);