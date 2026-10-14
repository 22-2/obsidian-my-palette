import { spawn } from "node:child_process";
import { generateCoverageReport, resetCoverageOutput } from "obsidian-e2e-toolkit/coverage";

const outputDir = "coverage/e2e";
const root = process.cwd();

function run(args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn("pnpm", args, {
			cwd: root,
			env,
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) reject(new Error(`pnpm terminated by ${signal}`));
			else resolve(code ?? 1);
		});
	});
}

const coverageEnv = { ...process.env, E2E_COVERAGE: "1" };
const normalEnv = { ...process.env, E2E_COVERAGE: "0" };
let exitCode = 0;

await resetCoverageOutput(outputDir);
try {
	exitCode = await run(["build"], coverageEnv);
	if (exitCode === 0)
		exitCode = await run(["exec", "node", "e2e/prepare-plugin.mjs"], coverageEnv);
	if (exitCode === 0) exitCode = await run(["exec", "playwright", "test"], coverageEnv);
} finally {
	try {
		await generateCoverageReport({ outputDir });
	} catch (error) {
		console.error(error);
		exitCode ||= 1;
	}
	const restoreExit = await run(["build"], normalEnv);
	if (restoreExit !== 0) exitCode ||= restoreExit;
}

process.exitCode = exitCode;
