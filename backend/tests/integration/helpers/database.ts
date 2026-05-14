import prisma from "../../../prisma/client";

export async function resetIntegrationDatabase(): Promise<void> {
	await prisma.directChat.updateMany({ data: { lastMessageId: null } });

	await prisma.$transaction([
		prisma.directChatMessage.deleteMany(),
		prisma.directChat.deleteMany(),
		prisma.friendship.deleteMany(),
		prisma.note.deleteMany(),
		prisma.session.deleteMany(),
		prisma.action.deleteMany(),
		prisma.gameChatMessage.deleteMany(),
		prisma.gameBotSetup.deleteMany(),
		prisma.gameRoleSetup.deleteMany(),
		prisma.participant.deleteMany(),
		prisma.game.deleteMany(),
		prisma.userPlayer.deleteMany(),
		prisma.user.deleteMany(),
		prisma.player.deleteMany({ where: { type: "user" } })
	]);
}

export async function disconnectIntegrationDatabase(): Promise<void> {
	await prisma.$disconnect();
}
