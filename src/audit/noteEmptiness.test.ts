import { describe, expect, it, vi } from "vitest";
import { emptinessBadge } from "src/audit/noteEmptiness";

vi.mock("obsidian", () => ({ getFrontMatterInfo: () => ({ contentStart: 0 }) }));

describe("emptinessBadge", () => {
	it("marks empty and MOC-only notes and leaves written ones unmarked", () => {
		expect(emptinessBadge({ kind: "empty" })).toBe("Empty");
		expect(emptinessBadge({ kind: "moc-only", references: 0 })).toBe("MOC only");
		expect(emptinessBadge({ kind: "moc-only", references: 3 })).toBe("MOC only");
		expect(emptinessBadge({ kind: "written" })).toBeUndefined();
	});
});
