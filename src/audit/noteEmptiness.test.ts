import { describe, expect, it, vi } from "vitest";
import { emptinessBadge } from "src/audit/noteEmptiness";

vi.mock("obsidian", () => ({ getFrontMatterInfo: () => ({ contentStart: 0 }) }));

describe("空のバッジ", () => {
	it("空の MOC のみのメモにマークを付け、書かれたメモにはマークを付けずに残します", () => {
		expect(emptinessBadge({ kind: "empty" })).toBe("空");
		expect(emptinessBadge({ kind: "moc-only" })).toBe("MOC のみ");
		expect(emptinessBadge({ kind: "written" })).toBeUndefined();
	});
});
