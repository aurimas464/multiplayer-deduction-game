const js = require("@eslint/js")
const tsParser = require("@typescript-eslint/parser")
const tsPlugin = require("@typescript-eslint/eslint-plugin")
const globals = require("globals")
const { defineConfig, globalIgnores } = require("eslint/config")

module.exports = defineConfig([
	globalIgnores(["dist", "node_modules"]),
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2020,
			sourceType: "module",
			globals: globals.node
		},
		plugins: {
			"@typescript-eslint": tsPlugin
		},
		rules: {
			...js.configs.recommended.rules,
			...tsPlugin.configs.recommended.rules
		}
	}
])