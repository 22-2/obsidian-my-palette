import { describe, expect, it } from "vitest";
import type { PaletteResult } from "src/palette/results";
import { canPreviewResult } from "src/palette/resultPreview";

function result(mode: PaletteResult["mode"]): PaletteResult {
	return { id: mode, mode, primary: mode, secondary: "" } as unknown as PaletteResult;
}

describe("canプレビュー結果", () => {
	it.each([
		"file",
		"tab",
		"bookmark",
		"smart",
		"link",
		"backlink",
		"everything",
		"tag",
		"audit",
	] as const)("previews %s results", (mode) => {
		expect(canPreviewResult(result(mode))).toBe(true);
	});

	it.each(["command", "mode-entry", "search-history", "property", "plugin", "snippet"] as const)(
		"does not preview %s results",
		(mode) => {
			expect(canPreviewResult(result(mode))).toBe(false);
		},
	);
});
