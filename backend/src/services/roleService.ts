import { RoleModel } from "../models/role";
import { ResponseRole, responseRolesSchema } from "../types/entities/role";
import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../models/game";
import prisma from "../../prisma/client";
import { GameRoleSetupModelTransaction } from "../models/gameRoleSetup";

class RoleService {
	public async getRoles(): Promise<ResponseRole[]> {
		const roles = await RoleModel.getRoles();
		return responseRolesSchema.parse(roles);
	}

	public async updateRoleSettings(playerId: number, gameId: number, roleSettings: Record<number, number>): Promise<boolean> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const gameRoleSetupModel = GameRoleSetupModelTransaction(tx);

            const lobby = await gamesModel.findGameWithParticipants(gameId);
            if (!lobby) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (lobby.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_ALREADY_STARTED);
			}

			const myParticipant = lobby.participants.find((p) => p.playerId === playerId);
			if (!myParticipant || myParticipant.seatNr !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			return await gameRoleSetupModel.upsertRoleSettings(gameId, roleSettings);
		});
	}
}

export default new RoleService();