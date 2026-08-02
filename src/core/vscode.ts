import { promises as fs } from "fs";
import { spawn } from "child_process";
import * as path from "path";

async function findCodeExecutable(): Promise<string | null> {
	const candidates = [
		process.env.VSCODE_EXEC_PATH,
		process.env.LOCALAPPDATA &&
			path.win32.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
		process.env.LOCALAPPDATA &&
			path.win32.join(
				process.env.LOCALAPPDATA,
				"Programs",
				"Microsoft VS Code Insiders",
				"Code - Insiders.exe",
			),
		process.env.ProgramFiles &&
			path.win32.join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
		process.env["ProgramFiles(x86)"] &&
			path.win32.join(process.env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe"),
		...(process.env.PATH ?? "")
			.split(path.win32.delimiter)
			.flatMap((directory) => [
				path.win32.join(directory, "Code.exe"),
				path.win32.join(directory, "..", "Code.exe"),
			]),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		try {
			const resolved = path.win32.resolve(candidate);
			if ((await fs.stat(resolved)).isFile()) return resolved;
		} catch {
			// Try the next known VS Code installation path.
		}
	}
	return null;
}

export async function openPathInCode(
	vaultRoot: string,
	absolutePath: string,
): Promise<string | null> {
	const executable = await findCodeExecutable();
	if (!executable) return "Could not find VS Code (Code.exe).";
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(executable, ["--new-window", vaultRoot, absolutePath], {
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve();
			});
		});
		return null;
	} catch {
		return "Could not open the file in VS Code.";
	}
}
