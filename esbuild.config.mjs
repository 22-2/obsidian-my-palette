import { builtinModules } from "node:module";
import { renameSync } from "node:fs";
import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/**
 * Obsidian loads the plugin from main.js and styles.css. esbuild names the CSS
 * imported by src/main.ts after the entry (main.css), so rename it once each
 * build finishes.
 */
const renameStylesPlugin = {
	name: "rename-styles",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) return;
			renameSync("dist/main.css", "dist/styles.css");
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	outdir: "dist",
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2022",
	minify: !isWatch,
	sourcemap: isWatch ? "inline" : false,
	logLevel: "info",
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
		...builtinModules.map((name) => `node:${name}`),
	],
	plugins: [renameStylesPlugin],
});

if (isWatch) {
	await context.watch();
} else {
	await context.rebuild();
	await context.dispose();
}
