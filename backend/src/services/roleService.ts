import { RoleModel } from "../repositories/roleRepository";
import { ResponseRoles, responseRolesSchema } from "../types/entities/role";
import { AppError, ErrorCode } from "../types";
import { GameModelTransaction } from "../repositories/gameRepository";
import { ParticipantModelTransaction } from "../repositories/participantRepository";
import prisma from "../../prisma/client";
import { GameRoleSetupModelTransaction } from "../repositories/gameRoleSetupRepository";

class RoleService {
	async getRoles(): Promise<ResponseRoles> {
		const roles = await RoleModel.listRoles();
		return responseRolesSchema.parse(roles);
	}
	
	async updateRoleSettings(playerId: number, gameId: number, roleSettings: Record<number, number>): Promise<boolean> {
		return prisma.$transaction(async (tx) => {
			const gamesModel = GameModelTransaction(tx);
			const participantsModel = ParticipantModelTransaction(tx);
			const gameRoleSetupModel = GameRoleSetupModelTransaction(tx);

            const game = await gamesModel.findByGameId(gameId);
            if (!game) {
				throw new AppError(ErrorCode.GAME_NOT_FOUND);
			}
			if (game.status !== "lobby") {
				throw new AppError(ErrorCode.GAME_NOT_IN_LOBBY);
			}

			const existingParticipants = await participantsModel.findByGameId(gameId);
			const myParticipant = existingParticipants.find((p) => p.playerId === playerId);
			if (!myParticipant || myParticipant.seatNr !== 1) {
				throw new AppError(ErrorCode.NOT_GAME_LEADER);
			}

			for (const [roleId, count] of Object.entries(roleSettings)) {
				await gameRoleSetupModel.upsert({gameId, roleId: Number(roleId), count});
			}
			return true;
		});
	}
}

export default new RoleService();