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
		const changed = { ...modes, commands: { alias: "c", enabled: true } };
		expect(paletteModeAlias("commands", changed)).toBe("c");
		expect(parseDirectModeEntry("c link", changed)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("> link", changed)).toBeUndefined();
	});
});

describe("matchPaletteModes", () => {
	test("leaves a disabled mode out of Home and of alias entry", () => {
		const disabled = { ...modes, commands: { ...modes.commands, enabled: false } };
		expect(matchPaletteModes("", disabled).map(({ id }) => id)).not.toContain("commands");
		expect(matchPaletteModes("> ", disabled)).toEqual([]);
		expect(parseDirectModeEntry("> link", disabled)).toBeUndefined();
		expect(paletteModeAlias("commands", disabled)).toBe(">");
	});

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

	test("the old es alias is no longer an entry point", () => {
		expect(parseDirectModeEntry("es notes", modes)).toBeUndefined();
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
		// es is free again, since it is no longer a hidden alias.
		expect(validateModeAlias("commands", "es", modes)).toBeUndefined();
	});
});
