// Assembles the built plugin (manifest.json, main.js, styles.css) into .e2e/plugin,
// the folder layout Obsidian expects for an installed plugin.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePlugin } from "obsidian-e2e-toolkit";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const fromRoot = (file) => path.join(repoRoot, file);

await preparePlugin(
	{
		manifest: fromRoot("manifest.json"),
		main: fromRoot("dist/main.js"),
		styles: fromRoot("dist/styles.css"),
	},
	fromRoot(".e2e/plugin"),
);
