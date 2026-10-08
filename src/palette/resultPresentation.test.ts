import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	matchedMetadataPresentation,
	toPaletteSelectionItem,
} from "src/palette/resultPresentation";

vi.mock("obsidian", () => ({ TFile: class {}, normalizePath: (path: string) => path }));

describe("matched metadata presentation", () => {
	it("limits the combined chips and keeps all matching metadata in the tooltip", () => {
		expect(
			matchedMetadataPresentation(
				["#project"],
				["roadmap", "planning", "milestone", "schedule"],
			),
		).toEqual({
			tags: ["#project", "roadmap", "planning", "+2"],
			tagsTitle: "Tags: #project\nKeywords: roadmap, planning, milestone, schedule",
		});
		expect(matchedMetadataPresentation([])).toEqual({});
	});

	it("shows keyword-only hits beneath the filename without adding hashes", () => {
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
			tagsTitle: "Keywords: 宇宙, 星空観察",
		});
	});
});
