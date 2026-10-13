import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const openFolder = args.includes("--open");
const root = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = resolve(process.env.UI_SHOT_DIR ?? join(tmpdir(), "my-palette-ui-screenshots"));
await mkdir(outputRoot, { recursive: true });
// A new run folder every time, so an image viewer that still has the last run open is not overwritten.
const outputDirectory = await mkdtemp(join(outputRoot, "run-"));

// Electron starts as plain Node when ELECTRON_RUN_AS_NODE is set, which some shells export.
const env = { ...process.env, UI_SHOT_DIR: outputDirectory };
delete env.ELECTRON_RUN_AS_NODE;

function run(command, commandArgs, options = {}) {
	const result = spawnSync(command, commandArgs, {
		cwd: root,
		env,
		stdio: "inherit",
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(root, "node_modules/electron/install.js")]);
run("vp build", [], { shell: true });
run(process.execPath, ["e2e/prepare-plugin.mjs"]);
run(process.execPath, [
	fileURLToPath(import.meta.resolve("@playwright/test/cli")),
	"test",
	"--config",
	"playwright.screenshots.config.mts",
	...args.filter((arg) => arg !== "--open"),
]);

console.log(`Screenshots: ${outputDirectory}`);

if (openFolder) {
	const opener =
		process.platform === "win32"
			? "explorer.exe"
			: process.platform === "darwin"
				? "open"
				: "xdg-open";
	const child = spawn(opener, [outputDirectory], { detached: true, stdio: "ignore" });
	child.on("error", (error) => {
		console.error(error);
		process.exitCode = 1;
	});
	child.unref();
}
