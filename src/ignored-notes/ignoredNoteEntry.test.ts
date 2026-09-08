import { describe, expect, it } from "vitest";
import { ignoredNotePathParts } from "src/ignored-notes/ignoredNotePath";

describe("ignoredNotePathParts", () => {
	it("extracts a basename and normalized extension", () => {
		expect(ignoredNotePathParts("archive/Quarterly.Report.MD")).toEqual({
			basename: "Quarterly.Report",
			extension: "md",
		});
	});

	it("keeps extensionless and dot-prefixed names intact", () => {
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
