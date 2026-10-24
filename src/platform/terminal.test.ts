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

describe("getターミナルコマンド", () => {
	it("ディレクトリ内で切り離された Windows ターミナルを開きます", () => {
		expect(getTerminalCommand("win32", "C:\\vault")).toBe(
			`start "" "${getWindowsTerminalPath()}" -d "C:\\vault"`,
		);
	});

	it("Terminal.app と x-terminal-emulator を別の場所で開きます", () => {
		expect(getTerminalCommand("darwin", "/vault")).toBe('open -a Terminal "/vault"');
		expect(getTerminalCommand("linux", "/vault")).toBe(
			"x-terminal-emulator --working-directory=/vault",
		);
	});

	it("サポートされていないプラットフォームではコマンドがありません", () => {
		expect(getTerminalCommand("sunos", "/vault")).toBeNull();
	});
});

describe("getターミナルディレクトリ", () => {
	it("フォルダー自体とその親内のファイルを開きます", () => {
		expect(getTerminalDirectory("C:\\vault\\plugins\\alpha", true)).toBe(
			"C:\\vault\\plugins\\alpha",
		);
		expect(getTerminalDirectory("C:\\vault\\Note.md", false)).toBe("C:\\vault");
		expect(getTerminalDirectory("/vault/notes/a.md", false)).toBe("/vault/notes");
	});
});

describe("ターミナル内のopenDirectory", () => {
	it("プラットフォームコマンドを実行します", async () => {
		const { exec } = await import("node:child_process");
		await openDirectoryInTerminal("C:\\vault");
		expect(exec).toHaveBeenCalledOnce();
	});
});
