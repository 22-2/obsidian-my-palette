import { describe, expect, it, vi } from "vitest";
import {
	getTerminalCommand,
	getTerminalDirectory,
	getWindowsTerminalPath,
	openDirectoryInTerminal,
} from "src/platform/terminal";

vi.mock("node:child_process", () => ({
	exec: vi.fn((_command: string, callback: (error: Error | null) => void) => callback(null)),
}));

describe("getTerminalCommand", () => {
	it("opens Windows Terminal detached in the directory", () => {
		expect(getTerminalCommand("win32", "C:\\vault")).toBe(
			`start "" "${getWindowsTerminalPath()}" -d "C:\\vault"`,
		);
	});

	it("opens Terminal.app and x-terminal-emulator elsewhere", () => {
		expect(getTerminalCommand("darwin", "/vault")).toBe('open -a Terminal "/vault"');
		expect(getTerminalCommand("linux", "/vault")).toBe(
			"x-terminal-emulator --working-directory=/vault",
		);
	});

	it("has no command on unsupported platforms", () => {
		expect(getTerminalCommand("sunos", "/vault")).toBeNull();
	});
});

describe("getTerminalDirectory", () => {
	it("opens folders themselves and files in their parent", () => {
		expect(getTerminalDirectory("C:\\vault\\plugins\\alpha", true)).toBe(
			"C:\\vault\\plugins\\alpha",
		);
		expect(getTerminalDirectory("C:\\vault\\Note.md", false)).toBe("C:\\vault");
		expect(getTerminalDirectory("/vault/notes/a.md", false)).toBe("/vault/notes");
	});
});

describe("openDirectoryInTerminal", () => {
	it("runs the platform command", async () => {
		const { exec } = await import("node:child_process");
		await openDirectoryInTerminal("C:\\vault");
		expect(exec).toHaveBeenCalledOnce();
	});
});
