// Assembles the built plugin (manifest.json + main.js + styles.css) into one
// folder, which is the layout Obsidian expects for an installed plugin.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const out = ".e2e/plugin";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("manifest.json", `${out}/manifest.json`);
cpSync("dist/main.js", `${out}/main.js`);
cpSync("dist/styles.css", `${out}/styles.css`);
