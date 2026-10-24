import { describe, expect, it } from "vitest";
import { compactPath } from "src/shared/pathDisplay";

describe("コンパクトパス", () => {
	it("Windows ドライブと最終フォルダーを保持します", () => {
		expect(compactPath("E:\\AppData\\obsidian\\plugins\\backups")).toBe(
			"E:\\…\\plugins\\backups",
		);
	});

	it("短い相対パスをそのまま維持します", () => {
		expect(compactPath("folder/note.md")).toBe("folder/note.md");
		expect(compactPath("folder/deep/note.md")).toBe("folder/deep/note.md");
	});
});
