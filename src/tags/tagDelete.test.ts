import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	deleteAliasTags,
	deleteFrontmatterTags,
	deleteInlineTags,
	type InlineTagPosition,
} from "src/tags/tagRename";
import { applyTagEdit, deleteTagEdit } from "src/tags/tagRenameFiles";

vi.mock("obsidian", () => ({
	parseFrontMatterTags: () => undefined,
	parseFrontMatterAliases: () => undefined,
}));

/** 本文のタグの位置を、テキストから作る。 */
function positionsOf(text: string): InlineTagPosition[] {
	return [...text.matchAll(/#[^\s,.#]+/g)].map((match) => ({
		tag: match[0],
		start: match.index,
		end: match.index + match[0].length,
	}));
}

describe("deleteInlineTags", () => {
	it("removes matching tags with the blank before them and keeps the others", () => {
		const text = "Body #old and #keep #old/x";
		expect(deleteInlineTags(text, positionsOf(text), ["old"])).toEqual({
			text: "Body and #keep",
			count: 2,
		});
	});

	it("removes a tag at the start of a line together with the blank after it", () => {
		const text = "#old first line";
		expect(deleteInlineTags(text, positionsOf(text), ["old"])).toEqual({
			text: "first line",
			count: 1,
		});
	});

	it("gives up when the text at a position is no longer the tag", () => {
		const positions = [{ tag: "#old", start: 0, end: 4 }];
		expect(deleteInlineTags("#changed", positions, ["old"])).toBeUndefined();
	});
});

describe("deleteFrontmatterTags", () => {
	it("removes matching items and reports the change", () => {
		expect(deleteFrontmatterTags(["old", "keep", "old/child"], ["old"])).toEqual({
			values: ["keep"],
			changed: true,
		});
	});

	it("does not report a change when nothing matches", () => {
		expect(deleteFrontmatterTags(["keep"], ["old"])).toEqual({
			values: ["keep"],
			changed: false,
		});
	});

	it("reads a string list and writes it back only when something is removed", () => {
		expect(deleteFrontmatterTags("old, keep", ["old"])).toEqual({
			values: ["keep"],
			changed: true,
		});
		expect(deleteFrontmatterTags("keep", ["old"]).changed).toBe(false);
	});
});

describe("deleteAliasTags", () => {
	it("removes only tag aliases that match", () => {
		expect(deleteAliasTags(["#old", "old", "#keep"], ["old"])).toEqual({
			values: ["old", "#keep"],
			changed: true,
		});
	});
});

describe("applyTagEdit with deleteTagEdit", () => {
	function noteWith(text: string, frontmatter: Record<string, unknown>) {
		const cache = {
			frontmatter,
			tags: positionsOf(text).map(({ tag, start, end }) => ({
				tag,
				position: { start: { offset: start }, end: { offset: end } },
			})),
		};
		const item = { text, frontmatter };
		const file = { path: "a.md" } as TFile;
		const app = {
			metadataCache: { getFileCache: () => cache },
			vault: {
				process: async (_file: TFile, fn: (text: string) => string) => {
					item.text = fn(item.text);
				},
			},
			fileManager: {
				processFrontMatter: async (
					_file: TFile,
					fn: (fm: Record<string, unknown>) => void,
				) => {
					fn(item.frontmatter);
				},
			},
		} as unknown as App;
		return { app, file, item };
	}

	it("removes the tag from the body and the frontmatter, and drops emptied keys", async () => {
		const { app, file, item } = noteWith("Body #old and #keep", {
			tags: ["old"],
			aliases: ["#old"],
		});
		expect(await applyTagEdit(app, file, deleteTagEdit(["old"]))).toBe("changed");
		expect(item.text).toBe("Body and #keep");
		expect(item.frontmatter).toEqual({});
	});

	it("reports unchanged when the note has no matching tag", async () => {
		const { app, file, item } = noteWith("Body #keep", { tags: ["keep"] });
		expect(await applyTagEdit(app, file, deleteTagEdit(["old"]))).toBe("unchanged");
		expect(item.text).toBe("Body #keep");
	});
});
