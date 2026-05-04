import prisma from "../../prisma/client";
import type { Prisma, Action as PrismaAction } from "@prisma/client";
import type { Action, CreateAction } from "../types/entities/action";

class Model {
	constructor(private readonly db: Prisma.TransactionClient | typeof prisma) {}

	private mapAction(action: PrismaAction): Action {
		return {
			id: action.id,
			gameId: action.gameId,
			actorParticipantId: action.actorParticipantId,
			targetParticipantId: action.targetParticipantId,
			dayNumber: action.dayNumber,
			phase: action.phase,
			actionKey: action.actionKey,
			createdAt: action.createdAt
		};
	}

	async create(data: CreateAction): Promise<Action> {
		const row = await this.db.action.create({data});

		return this.mapAction(row);
	}
}

export const ActionModel = new Model(prisma);
export const ActionModelTransaction = (tx: Prisma.TransactionClient) => new Model(tx);