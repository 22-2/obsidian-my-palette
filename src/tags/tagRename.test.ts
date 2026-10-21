import { describe, expect, it } from "vitest";
import {
	isTagOrChild,
	normalizeTagName,
	renameAliasTags,
	renameFrontmatterTags,
	renameInlineTags,
	renameTagName,
} from "src/tags/tagRename";

describe("normalizeTagName", () => {
	it("drops leading hashes and keeps hierarchy", () => {
		expect(normalizeTagName("#project")).toBe("project");
		expect(normalizeTagName("  ##work/2026 ")).toBe("work/2026");
		expect(normalizeTagName("日本語")).toBe("日本語");
	});

	it("rejects names Obsidian does not accept as tags", () => {
		expect(normalizeTagName("")).toBeUndefined();
		expect(normalizeTagName("#")).toBeUndefined();
		expect(normalizeTagName("a b")).toBeUndefined();
		expect(normalizeTagName("a,b")).toBeUndefined();
		expect(normalizeTagName("2026")).toBeUndefined();
	});
});

describe("renameTagName", () => {
	it("renames the tag itself regardless of case", () => {
		expect(renameTagName("Project", "project", "work")).toBe("work");
	});

	it("renames child tags and keeps their remaining part", () => {
		expect(renameTagName("project/Alpha/beta", "project", "work")).toBe("work/Alpha/beta");
	});

	it("leaves sibling tags that only share a prefix", () => {
		expect(renameTagName("project-x", "project", "work")).toBe("project-x");
		expect(renameTagName("projects", "project", "work")).toBe("projects");
	});
});

describe("isTagOrChild", () => {
	it("matches the tag and its children, ignoring case and hashes", () => {
		expect(isTagOrChild("#Project", "project")).toBe(true);
		expect(isTagOrChild("project/a", "project")).toBe(true);
		expect(isTagOrChild("project-a", "project")).toBe(false);
	});
});

describe("renameFrontmatterTags", () => {
	it("renames list items and keeps the others", () => {
		expect(renameFrontmatterTags(["old", "keep", "old/child"], "old", "new")).toEqual({
			values: ["new", "keep", "new/child"],
			changed: true,
		});
	});

	it("keeps a leading hash on each item", () => {
		expect(renameFrontmatterTags(["#old"], "old", "new")).toEqual({
			values: ["#new"],
			changed: true,
		});
	});

	it("reads a comma or space separated string and returns a list when it changes", () => {
		expect(renameFrontmatterTags("old, keep", "old", "new")).toEqual({
			values: ["new", "keep"],
			changed: true,
		});
	});

	it("does not rewrite a string that has nothing to rename", () => {
		expect(renameFrontmatterTags("keep, other", "old", "new")).toEqual({
			values: ["keep", "other"],
			changed: false,
		});
	});

	it("drops the duplicate that a rename creates and keeps the first one", () => {
		expect(renameFrontmatterTags(["old", "new", "other"], "old", "new")).toEqual({
			values: ["new", "other"],
			changed: true,
		});
	});

	it("leaves duplicates that existed before the rename", () => {
		expect(renameFrontmatterTags(["keep", "keep", "old"], "old", "new")).toEqual({
			values: ["keep", "keep", "new"],
			changed: true,
		});
		expect(renameFrontmatterTags(["keep", "keep"], "old", "new").changed).toBe(false);
	});

	it("ignores values that are not a tag list", () => {
		expect(renameFrontmatterTags(42, "old", "new")).toEqual({ values: [], changed: false });
		expect(renameFrontmatterTags(["old", 1], "old", "new").changed).toBe(false);
	});
});

describe("renameAliasTags", () => {
	it("renames only aliases that are tags", () => {
		expect(renameAliasTags(["#old/a", "old", "#other"], "old", "new")).toEqual({
			values: ["#new/a", "old", "#other"],
			changed: true,
		});
	});

	it("reports no change when no alias is a matching tag", () => {
		expect(renameAliasTags(["plain", "#other"], "old", "new")).toEqual({
			values: ["plain", "#other"],
			changed: false,
		});
	});
});

describe("renameInlineTags", () => {
	it("rewrites several tags and keeps the offsets of the others valid", () => {
		const text = "A #old and #old/x, then #keep and #Old.";
		const at = (tag: string) => {
			const start = text.indexOf(tag);
			return { tag, start, end: start + tag.length };
		};
		const positions = [at("#old"), at("#old/x"), at("#Old")];
		expect(renameInlineTags(text, positions, "old", "new")).toEqual({
			text: "A #new and #new/x, then #keep and #new.",
			count: 3,
		});
	});

	it("gives up when the text at a position is no longer the tag", () => {
		const positions = [{ tag: "#old", start: 0, end: 4 }];
		expect(renameInlineTags("#changed", positions, "old", "new")).toBeUndefined();
	});
});
