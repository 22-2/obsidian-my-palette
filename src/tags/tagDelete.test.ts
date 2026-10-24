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

describe("インラインタグの削除", () => {
	it("前に空白がある一致するタグを削除し、他のタグは保持します", () => {
		const text = "Body #old and #keep #old/x";
		expect(deleteInlineTags(text, positionsOf(text), ["old"])).toEqual({
			text: "Body and #keep",
			count: 2,
		});
	});

	it("行頭のタグとその後の空白を削除します。", () => {
		const text = "#old first line";
		expect(deleteInlineTags(text, positionsOf(text), ["old"])).toEqual({
			text: "first line",
			count: 1,
		});
	});

	it("ある位置のテキストがタグでなくなったら諦める", () => {
		const positions = [{ tag: "#old", start: 0, end: 4 }];
		expect(deleteInlineTags("#changed", positions, ["old"])).toBeUndefined();
	});
});

describe("フロントマタータグの削除", () => {
	it("一致する項目を削除し、変更を報告します", () => {
		expect(deleteFrontmatterTags(["old", "keep", "old/child"], ["old"])).toEqual({
			values: ["keep"],
			changed: true,
		});
	});

	it("何も一致しない場合は変更を報告しません", () => {
		expect(deleteFrontmatterTags(["keep"], ["old"])).toEqual({
			values: ["keep"],
			changed: false,
		});
	});

	it("文字列リストを読み取り、何かが削除された場合にのみそれを書き戻します", () => {
		expect(deleteFrontmatterTags("old, keep", ["old"])).toEqual({
			values: ["keep"],
			changed: true,
		});
		expect(deleteFrontmatterTags("keep", ["old"]).changed).toBe(false);
	});
});

describe("エイリアスタグの削除", () => {
	it("一致するタグ エイリアスのみを削除します", () => {
		expect(deleteAliasTags(["#old", "old", "#keep"], ["old"])).toEqual({
			values: ["old", "#keep"],
			changed: true,
		});
	});
});

describe("applyTagEdit と deleteTagEdit", () => {
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

	it("本体とフロントマターからタグを削除し、空のキーをドロップします", async () => {
		const { app, file, item } = noteWith("Body #old and #keep", {
			tags: ["old"],
			aliases: ["#old"],
		});
		expect(await applyTagEdit(app, file, deleteTagEdit(["old"]))).toBe("changed");
		expect(item.text).toBe("Body and #keep");
		expect(item.frontmatter).toEqual({});
	});

	it("メモに一致するタグがない場合、レポートは変更されません", async () => {
		const { app, file, item } = noteWith("Body #keep", { tags: ["keep"] });
		expect(await applyTagEdit(app, file, deleteTagEdit(["old"]))).toBe("unchanged");
		expect(item.text).toBe("Body #keep");
	});
});
