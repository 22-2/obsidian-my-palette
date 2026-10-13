import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** Prefers the Windows Terminal execution alias over same-named shims earlier in PATH. */
export function getWindowsTerminalPath(): string {
	return process.env.LOCALAPPDATA
		? `${process.env.LOCALAPPDATA}\\Microsoft\\WindowsApps\\wt.exe`
		: "wt.exe";
}

/**
 * Builds the OS-specific command that opens a terminal in a directory.
 * Initially the default shell only; a yazi or custom command setting comes later.
 */
export function getTerminalCommand(platform: NodeJS.Platform, directory: string): string | null {
	switch (platform) {
		case "win32":
			// `start ""` launches detached; the empty title keeps the quoted path
			// from being taken as a title.
			return `start "" "${getWindowsTerminalPath()}" -d "${directory}"`;
		case "darwin":
			return `open -a Terminal "${directory}"`;
		case "linux":
			return `x-terminal-emulator --working-directory=${directory}`;
		default:
			return null;
	}
}

/** Files open their parent folder; folders open themselves. */
export function getTerminalDirectory(absolutePath: string, isFolder: boolean): string {
	if (isFolder) return absolutePath;
	const parent = absolutePath.replace(/[\\/][^\\/]*$/, "");
	return parent || absolutePath;
}

/** Opens the directory in a system terminal; returns an error message on failure. */
export async function openDirectoryInTerminal(directory: string): Promise<string | null> {
	const command = getTerminalCommand(process.platform, directory);
	if (!command) return "Opening a terminal is not supported on this platform.";
	try {
		await execAsync(command);
		return null;
	} catch {
		return `Could not open a terminal at "${directory}".`;
	}
}
