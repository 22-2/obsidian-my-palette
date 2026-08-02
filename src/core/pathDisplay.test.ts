import { describe, expect, it } from "vitest";
import { compactPath } from "src/core/pathDisplay";

describe("compactPath", () => {
	it("keeps a Windows drive and the final folders", () => {
		expect(compactPath("E:\\AppData\\obsidian\\plugins\\backups")).toBe(
			"E:\\…\\plugins\\backups",
		);
	});

	it("keeps short and relative paths intact", () => {
		expect(compactPath("folder/note.md")).toBe("folder/note.md");
		expect(compactPath("folder/deep/note.md")).toBe("folder/deep/note.md");
	});
});
