import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	matchedMetadataPresentation,
	toPaletteSelectionItem,
} from "src/palette/resultPresentation";

vi.mock("obsidian", () => ({ TFile: class {}, normalizePath: (path: string) => path }));

describe("一致したメタデータのプレゼンテーション", () => {
	it("組み合わせられるチップを制限し、一致するすべてのメタデータをツールチップに保持します", () => {
		expect(
			matchedMetadataPresentation(
				["#project"],
				["roadmap", "planning", "milestone", "schedule"],
			),
		).toEqual({
			tags: ["#project", "roadmap", "planning", "+2"],
			tagsTitle: "タグ: #project\nキーワード: roadmap, planning, milestone, schedule",
		});
		expect(matchedMetadataPresentation([])).toEqual({});
	});

	it("ハッシュを追加せずに、ファイル名の下にあるキーワードのみのヒットを表示します", () => {
		const item = toPaletteSelectionItem(
			{} as App,
			{
				id: "note.md",
				mode: "file",
				primary: "note",
				secondary: "note.md",
				icon: "file-text",
				vaultPath: "note.md",
				matchedKeywords: ["宇宙", "星空観察"],
			},
			{ openExternalMarkdownInObsidian: true },
		);
		expect(item).toMatchObject({
			label: "note",
			tags: ["宇宙", "星空観察"],
			tagsTitle: "キーワード: 宇宙, 星空観察",
		});
	});
});
