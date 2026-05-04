import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
	globalIgnores(["dist", "node_modules"]),
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite
		],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser
		},
		rules: {
			// Disable restriction that enforces exporting only React components per file
			// I allow contexts, hooks, and helpers to be defined/exported together
			// Tradeoff is that fast refresh may not preserve component state
			// This is only important in development, no production impact
			"react-refresh/only-export-components": "off"
		}
	}
])
