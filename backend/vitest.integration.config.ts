import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["tests/integration/**/*.test.ts"],
		setupFiles: ["tests/integration/setup/env.ts"],
		reporters: ["verbose"],
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 30_000
	}
});
