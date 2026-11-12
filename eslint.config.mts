import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores, defineConfig } from "eslint/config";
import myPalette from "./eslint-rules/command-naming.mts";

// 層の依存の向きを保つ: core・i18n < platform < ui < settings・features < app。
// 下の層は上の層を import しない。層の説明は docs/DEVELOPMENT.md にある。
// テストと、さまざまな層をつなぎ合わせるテスト用の補助(src/ui/testing)は対象外にする。
const upperLayers = (...layers: string[]) => layers.map((layer) => `src/${layer}/**`);
const layerBoundaries = [
	{
		files: ["src/core/**/*.ts"],
		layer: "core",
		forbidden: [...upperLayers("platform", "ui", "settings", "features", "app"), "src/main"],
	},
	{
		files: ["src/platform/**/*.ts"],
		layer: "platform",
		forbidden: upperLayers("ui", "settings", "features", "app"),
	},
	{
		files: ["src/ui/**/*.ts"],
		layer: "ui",
		forbidden: upperLayers("settings", "features", "app"),
		ignores: ["src/ui/testing/**"],
	},
	{
		files: ["src/settings/**/*.ts", "src/features/**/*.ts"],
		layer: "settings・features",
		forbidden: upperLayers("app"),
	},
];

export default defineConfig(
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"e2e",
		"eslint-rules",
		"playwright.config.ts",
		"playwright.config.mts",
		"playwright.screenshots.config.mts",
		"vite.config.mts",
		"scripts",
		".e2e",
		".e2e-plugin",
		"obsidian-e2e-toolkit-assets",
		"playwright-report",
		"test-results",
		"coverage",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"vitest.config.mts",
						"manifest.json",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// Names of this plugin and the Obsidian and Smart Connections products keep their own casing.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: [
						"Obsidian",
						"Everything",
						"Smart Connections",
						"VS Code",
						"My Palette",
						"Relateds",
						"Markdown",
					],
					acronyms: ["MOC", "HTTP", "URL"],
					// Key names are shown as they are on the keyboard.
					ignoreWords: ["Enter", "Esc", "Tab"],
				},
			],
		},
	},
	...layerBoundaries.map(({ files, layer, forbidden, ignores = [] }) => ({
		files,
		ignores: ["**/*.test.ts", ...ignores],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: forbidden,
							message: `${layer} の層は上の層を import できない。依存の向きは docs/DEVELOPMENT.md を参照。`,
						},
					],
				},
			],
		},
	})),
	{
		// Commands are all "Open <thing>" with a matching kebab-case id.
		files: ["src/app/registerCommands.ts"],
		plugins: { "my-palette": myPalette },
		rules: { "my-palette/command-naming": "error" },
	},
	{
		// The test DOM helper implements Obsidian's createEl and instanceOf itself, so it
		// has to create raw elements and use globalThis.
		files: ["src/ui/testing/**/*.ts"],
		rules: {
			"obsidianmd/prefer-create-el": "off",
			"obsidianmd/prefer-instanceof": "off",
			"obsidianmd/no-global-this": "off",
		},
	},
	{
		// テストと設定ファイルは Obsidian の外（Node 上の Vitest）で動く。
		// window が無いためタイマーや globalThis を直接使い、Obsidian の TFile はモックの実体を型だけ合わせて使う。
		files: ["src/**/*.test.ts", "test/**/*.ts", "vitest.config.mts"],
		rules: {
			"obsidianmd/prefer-window-timers": "off",
			"obsidianmd/no-global-this": "off",
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/no-tfile-tfolder-cast": "off",
			// Vitest matchers such as expect.objectContaining return any, and the tests pass
			// mocked methods around on purpose, so these typed rules add noise without catching bugs.
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
);
