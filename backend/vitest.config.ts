import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["tests/unit/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			reporter: ["text"],
			include: ["src/services/**/*.ts"],
			exclude: ["src/services/**/*.test.ts"]
		}
	}
});
