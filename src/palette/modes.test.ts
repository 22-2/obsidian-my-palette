import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import {
	findPaletteMode,
	matchPaletteModes,
	PALETTE_MODES,
	paletteModeAlias,
	parseDirectModeEntry,
	validateModeAlias,
} from "src/palette/modes";

const modes = DEFAULT_SETTINGS.modes;
const ids = (input: string) => matchPaletteModes(input, modes).map(({ id }) => id);

describe("paletteModeAlias", () => {
	test("uses the aliases in the settings", () => {
		expect(paletteModeAlias("commands", modes)).toBe(">");
		expect(paletteModeAlias("everything", modes)).toBe("e");
		expect(paletteModeAlias("everything-all", modes)).toBe("esdir");
	});

	test("a changed alias is the one that enters the mode", () => {
		const changed = { ...modes, commands: { alias: "c" } };
		expect(paletteModeAlias("commands", changed)).toBe("c");
		expect(parseDirectModeEntry("c link", changed)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("> link", changed)).toBeUndefined();
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
		expect(parseDirectModeEntry("esdir report", modes)).toEqual({
			modeId: "everything-all",
			query: "report",
		});
		expect(parseDirectModeEntry("> link", modes)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("bk ", modes)).toEqual({ modeId: "bookmarks", query: "" });
	});

	test("keeps es as a hidden alias of the vault Everything search", () => {
		expect(parseDirectModeEntry("es notes", modes)).toEqual({
			modeId: "everything",
			query: "notes",
		});
	});

	test("needs the space after the alias", () => {
		expect(parseDirectModeEntry("esdir", modes)).toBeUndefined();
		expect(parseDirectModeEntry("books", modes)).toBeUndefined();
		expect(parseDirectModeEntry("estate", modes)).toBeUndefined();
	});
});

describe("findPaletteMode", () => {
	test("tells the two Everything scopes apart", () => {
		expect(findPaletteMode("everything", "vault")?.id).toBe("everything");
		expect(findPaletteMode("everything", "directory")?.id).toBe("everything-all");
		expect(findPaletteMode("link")?.id).toBe("outlinks");
	});
});

describe("validateModeAlias", () => {
	test("accepts an alias that only shares a start with another one", () => {
		expect(validateModeAlias("everything", "e", modes)).toBeUndefined();
		expect(validateModeAlias("commands", "c", modes)).toBeUndefined();
		expect(validateModeAlias("everything", "es", modes)).toBeUndefined();
	});

	test("rejects empty, spaced and taken aliases", () => {
		expect(validateModeAlias("commands", " ", modes)).toBe("Enter an alias.");
		expect(validateModeAlias("commands", "c x", modes)).toBe("Aliases cannot contain spaces.");
		expect(validateModeAlias("commands", "E", modes)).toBe(
			'"E" is already used by another mode.',
		);
		expect(validateModeAlias("commands", "esdir", modes)).toBeDefined();
		expect(validateModeAlias("commands", "es", modes)).toBeDefined();
	});
});
