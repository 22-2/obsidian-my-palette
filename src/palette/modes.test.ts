import { describe, expect, test } from "vitest";
import {
	findPaletteMode,
	matchPaletteModes,
	PALETTE_MODES,
	paletteModeAlias,
	parseDirectModeEntry,
} from "src/palette/modes";

const prefixes = { command: ">", everything: "e " };
const ids = (input: string) => matchPaletteModes(input, prefixes).map(({ id }) => id);

describe("paletteModeAlias", () => {
	test("uses the configured prefixes without their trailing space", () => {
		expect(paletteModeAlias("commands", prefixes)).toBe(">");
		expect(paletteModeAlias("everything", prefixes)).toBe("e");
		expect(paletteModeAlias("everything-all", prefixes)).toBe("esdir");
	});
});

describe("matchPaletteModes", () => {
	test("lists every mode for an empty input", () => {
		expect(ids("  ")).toEqual(PALETTE_MODES.map(({ id }) => id));
	});

	test("puts an exact alias before alias prefixes", () => {
		expect(ids("b")).toEqual(["backlinks", "bookmarks"]);
		expect(ids("e")[0]).toBe("everything");
		expect(ids("esdir")).toEqual(["everything-all"]);
	});

	test("matches the start of title and subtitle words", () => {
		expect(ids("switch")).toEqual(["tabs"]);
		expect(ids("search back")).toEqual(["backlinks"]);
		expect(ids("smart")).toEqual(["smart"]);
	});

	test("does not match words in the middle", () => {
		expect(ids("witch")).toEqual([]);
	});
});

describe("parseDirectModeEntry", () => {
	test("enters a mode with the rest of the input as its query", () => {
		expect(parseDirectModeEntry("esdir report", prefixes)).toEqual({
			modeId: "everything-all",
			query: "report",
		});
		expect(parseDirectModeEntry("> link", prefixes)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("bk ", prefixes)).toEqual({ modeId: "bookmarks", query: "" });
	});

	test("keeps es as a hidden alias of the vault Everything search", () => {
		expect(parseDirectModeEntry("es notes", prefixes)).toEqual({
			modeId: "everything",
			query: "notes",
		});
	});

	test("needs the space after the alias", () => {
		expect(parseDirectModeEntry("esdir", prefixes)).toBeUndefined();
		expect(parseDirectModeEntry("books", prefixes)).toBeUndefined();
		expect(parseDirectModeEntry("estate", prefixes)).toBeUndefined();
	});
});

describe("findPaletteMode", () => {
	test("tells the two Everything scopes apart", () => {
		expect(findPaletteMode("everything", "vault")?.id).toBe("everything");
		expect(findPaletteMode("everything", "directory")?.id).toBe("everything-all");
		expect(findPaletteMode("link")?.id).toBe("outlinks");
	});
});
