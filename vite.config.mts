import { obsidianCopyVite } from "@22-2/obsidian-copy-bundler-plugin";
import { builtinModules } from "module";
import path from "path";
import { defineConfig, type UserConfig } from "vite-plus";

export default defineConfig(async ({ mode }) => {
	const { resolve } = path;
	const isWatch = process.argv.includes("--watch");
	const isDev = mode === "development" || isWatch;
	const isProd = !isDev;

	return {
		staged: {
			"src/**/*.{ts}": "vp check --fix",
		},

		plugins: [
			// Ensure CI/build output `dist/` contains files Obsidian expects (manifest.json, main.js)
			obsidianCopyVite({
				targetDir: path.resolve(__dirname, "dist"),
				force: true,
			}),
			obsidianCopyVite({
				targetDir: "E:\\AppData\\obsidian\\vaults\\suizen\\.obsidian\\plugins\\my-palette",
				force: true,
			}),
		],
		build: {
			lib: {
				entry: resolve(__dirname, "src/main.ts"),
				name: "main",
				fileName: () => "main.js",
				formats: ["cjs"],
			},
			minify: isProd,
			sourcemap: isProd ? false : "inline",
			// watchモード時はRollupのwatch設定を渡す
			// ここではsrc配下のファイルを監視対象にしておく（必要に応じて調整してください）
			watch: isWatch ? { include: "src/**" } : undefined,
			cssCodeSplit: false,
			emptyOutDir: false,
			rollupOptions: {
				input: {
					main: resolve(__dirname, "src/main.ts"),
				},
				output: {
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtinModules,
				],
			},
		},
	} as UserConfig;
});
