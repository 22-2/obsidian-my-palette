import { describe, expect, it } from "vitest";
import { ignoredNotePathParts } from "src/ignored-notes/ignoredNotePath";

describe("無視されたメモパスパーツ", () => {
	it("ベース名と正規化された拡張子を抽出します", () => {
		expect(ignoredNotePathParts("archive/Quarterly.Report.MD")).toEqual({
			basename: "Quarterly.Report",
			extension: "md",
		});
	});

	it("拡張子のない名前とドット接頭辞の名前をそのまま維持します", () => {
		expect(ignoredNotePathParts("archive/README")).toEqual({
			basename: "README",
			extension: "",
		});
		expect(ignoredNotePathParts("archive/.index")).toEqual({
			basename: ".index",
			extension: "",
		});
	});
});
