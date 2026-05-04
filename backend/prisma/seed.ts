import { RoleModel } from "../src/repositories/roleRepository";
import { BotModel } from "../src/repositories/botRepository";
import { roleAlignment } from "../src/types/entities/role";

const ROLES = [
	// Vampire roles
	{ key: "vampire", alignment: roleAlignment[0], weight: -3 },
	{ key: "count", alignment: roleAlignment[0], weight: -7 },
	{ key: "bloodBank", alignment: roleAlignment[0], weight: -5 },
	// Commune roles
	{ key: "commoner", alignment: roleAlignment[1], weight: 1 },
	{ key: "visionary", alignment: roleAlignment[1], weight: 2 },
	{ key: "vigilante", alignment: roleAlignment[1], weight: 2 },
	{ key: "watchman", alignment: roleAlignment[1], weight: 2 },
	{ key: "jailor", alignment: roleAlignment[1], weight: 3 },
	{ key: "priest", alignment: roleAlignment[1], weight: 3 },
	// Neutral roles
	{ key: "jester", alignment: roleAlignment[2], weight: 0 },
	{ key: "serialKiller", alignment: roleAlignment[2], weight: -4 },
	{ key: "chronicler", alignment: roleAlignment[2], weight: 2 }
];

// Names
const BOT_NAMES = ["Alaric","Lucien","Vesper","Valerius","Ravenna","Draven","Isolde","Morwen","Corvin","Selene","Thorne","Lilith","Varian","Nyx","Adrian","Belladonna","Dorian","Malachai","Seraphine","Noctis"] as const;

async function seedRoles(): Promise<void> {
	for (const role of ROLES) {
		await RoleModel.upsert(role);
	}
}

async function seedBots(): Promise<void> {
	for (const name of BOT_NAMES) {
		const existingBot = await BotModel.findByName(name);
		if (!existingBot) {
			await BotModel.create({ name });
		}
	}
}

export async function seed(): Promise<void> {
	await seedRoles();
	await seedBots();
}