import prisma from "../../prisma/client";
import type { Prisma, User as PrismaUser, Player as PrismaPlayer } from "@prisma/client";
import { User, CreateUser, PatchUser, UserWithPlayer } from "../types/entities/user";
import { Player } from "../types/entities/player";

import bcrypt from "bcryptjs";
import { AppError, ErrorCode } from "../types/index";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapUser(user: PrismaUser): User {
		return {
			id: user.id,
			username: user.username,
			email: user.email,
			password: user.password,
			theme: user.theme,
			colorTheme: user.colorTheme,
			language: user.language,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt
		};
	}

	private mapPlayer(player: PrismaPlayer): Player {
		return {
			id: player.id,
			icon: player.icon,
			iconEtag: player.iconEtag,
			type: player.type,
			createdAt: player.createdAt,
			updatedAt: player.updatedAt
		};
	}

	async create(data: CreateUser): Promise<UserWithPlayer> {
		const user = await this.db.user.create({ data });

		const player = await this.db.player.create({
			data: {
				type: "user"
			}
		});

		await this.db.userPlayer.create({
			data: {
				userId: user.id,
				playerId: player.id
			}
		});

		return { ...this.mapUser(user), player: this.mapPlayer(player) };
	}

	async findById(id: number): Promise<UserWithPlayer | null> {
		const row = await this.db.user.findUnique({
			where: { id },
			include: {
				userPlayer: {
					include: {
						player: true
					}
				}
			}
		});

		if (!row) return null;
		
		if (!row.userPlayer?.player) {
			throw new AppError(ErrorCode.INTERNAL_ERROR);
		}

		return {
			...this.mapUser(row),
			player: this.mapPlayer(row.userPlayer.player)
		};
	}

	async findByIds(ids: number[]): Promise<UserWithPlayer[]> {
		if (ids.length === 0) return [];

		const rows = await this.db.user.findMany({
			where: { id: { in: ids } },
			include: {
				userPlayer: {
					include: {
						player: true
					}
				}
			}
		});

		return rows.map((row) => {
			if (!row.userPlayer?.player) {
				throw new AppError(ErrorCode.INTERNAL_ERROR);
			}

			return {
				...this.mapUser(row),
				player: this.mapPlayer(row.userPlayer.player)
			};
		});
	}

	async findByUsername(username: string): Promise<User | null> {
		const row = await this.db.user.findUnique({
			where: { username }
		});

		return row ? this.mapUser(row) : null;
	}

	async findByEmail(email: string): Promise<User | null> {
		const row = await this.db.user.findUnique({
			where: { email }
		});

		return row ? this.mapUser(row) : null;
	}

	async findByEmailOrName(login: string): Promise<User | null> {
		const row = await this.db.user.findFirst({
			where: {
				OR: [{ email: login }, { username: login }]
			}
		});

		return row ? this.mapUser(row) : null;
	}

	async patch(patch: PatchUser): Promise<void> {
		const userData: Prisma.UserUpdateInput = {};
		if (patch.username !== undefined) userData.username = patch.username;
		if (patch.email !== undefined) userData.email = patch.email;
		if (patch.password !== undefined) {
			userData.password = await bcrypt.hash(patch.password, 10);
		}
		if (patch.theme !== undefined) userData.theme = patch.theme;
		if (patch.colorTheme !== undefined) userData.colorTheme = patch.colorTheme;
		if (patch.language !== undefined) userData.language = patch.language;

		const playerData: Prisma.PlayerUpdateInput = {};
		if (patch.icon !== undefined) {
			playerData.icon = patch.icon;
		}
		if (patch.iconEtag !== undefined) {
			playerData.iconEtag = patch.iconEtag;
		}

		const shouldPatchUser = Object.keys(userData).length > 0;
		const shouldPatchPlayer = Object.keys(playerData).length > 0;

		if (shouldPatchUser) {
			await this.db.user.update({
				where: { id: patch.id },
				data: userData
			});
		}

		if (shouldPatchPlayer) {
			const row = await this.db.userPlayer.findUnique({
				where: { userId: patch.id },
				select: { playerId: true }
			});

			if (!row) {
				throw new AppError(ErrorCode.INTERNAL_ERROR);
			}

			await this.db.player.update({
				where: { id: row.playerId },
				data: playerData
			});
		}
	}
}

export const UserModel = new Model(prisma);
export const UserModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);