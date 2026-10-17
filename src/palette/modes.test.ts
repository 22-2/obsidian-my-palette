import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import {
	findPaletteMode,
	availableModes,
	matchPaletteModes,
	PALETTE_MODES,
	paletteModeAlias,
	parseDirectModeEntry,
	validateModeAlias,
} from "src/palette/modes";

const modes = DEFAULT_SETTINGS.modes;
const ids = (input: string) => matchPaletteModes(input, modes).map(({ id }) => id);

test("only initialized integrations can be listed or entered by alias", () => {
	const available = availableModes(DEFAULT_SETTINGS, {
		everything: false,
		smartConnections: false,
	});
	expect(matchPaletteModes("", available).map(({ id }) => id)).not.toContain("everything");
	expect(parseDirectModeEntry("sc report", available)).toBeUndefined();
	expect(available.notes.enabled).toBe(true);
});

describe("paletteModeAlias", () => {
	test("uses the aliases in the settings", () => {
		expect(paletteModeAlias("commands", modes)).toBe(">");
		expect(paletteModeAlias("everything", modes)).toBe("e");
		expect(paletteModeAlias("plugins", modes)).toBe("p");
		expect(paletteModeAlias("snippets", modes)).toBe("sn");
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
	test("starts Home with Notes and enters its built-in file search", () => {
		expect(ids("")[0]).toBe("notes");
		expect(findPaletteMode("file")?.id).toBe("notes");
		expect(parseDirectModeEntry("n report", modes)).toEqual({
			modeId: "notes",
			query: "report",
		});
	});
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

	test("lists Plugins after Tabs and enters it by alias", () => {
		const order = ids("");
		expect(order.at(-3)).toBe("snippets");
		expect(order.at(-2)).toBe("properties");
		expect(order.at(-1)).toBe("audit");
		expect(order.indexOf("tabs")).toBeLessThan(order.indexOf("plugins"));
		expect(order.indexOf("plugins")).toBeLessThan(order.indexOf("snippets"));
		expect(parseDirectModeEntry("pr status", modes)).toEqual({
			modeId: "properties",
			query: "status",
		});
		expect(parseDirectModeEntry("p alpha", modes)).toEqual({
			modeId: "plugins",
			query: "alpha",
		});
		expect(parseDirectModeEntry("sn beta", modes)).toEqual({
			modeId: "snippets",
			query: "beta",
		});
	});

	test("puts an exact alias before alias prefixes", () => {
		expect(ids("b")).toEqual(["backlinks", "bookmarks"]);
		expect(ids("e")[0]).toBe("everything");
		expect(ids("esdir")).toEqual([]);
	});

	test("matches the start of title and subtitle words", () => {
		expect(ids("タブ")).toEqual(["tabs"]);
		expect(ids("発リンク")).toEqual(["outlinks"]);
		expect(ids("smart")).toEqual(["smart"]);
	});

	test("does not match words in the middle", () => {
		expect(ids("acklinks")).toEqual([]);
	});
});

describe("parseDirectModeEntry", () => {
	test("enters a mode with the rest of the input as its query", () => {
		expect(parseDirectModeEntry("e report", modes)).toEqual({
			modeId: "everything",
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
	test("uses one Everything mode for both search scopes", () => {
		expect(findPaletteMode("everything")?.id).toBe("everything");
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
		expect(validateModeAlias("commands", " ", modes)).toBe("エイリアスを入力してください。");
		expect(validateModeAlias("commands", "c x", modes)).toBe("エイリアスに空白は使えません。");
		expect(validateModeAlias("commands", "E", modes)).toBe(
			'"E" はほかのモードですでに使われています。',
		);
		expect(validateModeAlias("commands", "esdir", modes)).toBeUndefined();
		// es is free again, since it is no longer a hidden alias.
		expect(validateModeAlias("commands", "es", modes)).toBeUndefined();
	});
});
