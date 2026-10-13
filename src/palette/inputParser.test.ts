import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";

const modes = DEFAULT_SETTINGS.modes;

describe("Obsidian-excluded scope", () => {
	it("leaves a leading i in the File query now that a switch sets the scope", () => {
		expect(parseInput("i old meeting", modes)).toEqual({
			raw: "i old meeting",
			mode: "file",
			query: "i old meeting",
		});
	});
});

describe("parseInput Everything scopes", () => {
	it("no longer gives es a special meaning", () => {
		expect(parseInput("es", modes)).toMatchObject({ mode: "file", query: "es" });
		expect(parseInput("es ", modes)).toMatchObject({ mode: "file" });
	});

	it("keeps the Everything alias and its native syntax", () => {
		expect(parseInput('e content:"e"', modes)).toMatchObject({
			mode: "everything",
			query: 'content:"e"',
			everythingScope: "vault",
		});
	});

	it("supports the bare directory shortcut and its spaced form", () => {
		expect(parseInput("esdir", modes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
		expect(parseInput("esdir ", modes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
	});

	it("does not treat ordinary words starting with es as a prefix", () => {
		expect(parseInput("estate", modes)).toMatchObject({ mode: "file", query: "estate" });
	});
});

it("requires a trailing space before switching command mode", () => {
	expect(parseInput(">", modes)).toMatchObject({ mode: "file", query: ">" });
	expect(parseInput("> ", modes)).toMatchObject({
		mode: "command",
		query: "",
	});
});

describe("Bookmark prefix", () => {
	it("switches to bookmark search only after bk followed by a space", () => {
		expect(parseInput("bk", modes)).toMatchObject({ mode: "file", query: "bk" });
		expect(parseInput("bk ", modes)).toMatchObject({ mode: "bookmark", query: "" });
		expect(parseInput("bk project", modes)).toMatchObject({
			mode: "bookmark",
			query: "project",
		});
	});

	it("does not treat ordinary words beginning with bk as a prefix", () => {
		expect(parseInput("books", modes)).toMatchObject({ mode: "file", query: "books" });
	});
});

describe("Smart Connections prefix", () => {
	it("switches to Smart Connections search only after sc followed by a space", () => {
		expect(parseInput("sc", modes)).toMatchObject({ mode: "file", query: "sc" });
		expect(parseInput("sc ", modes)).toMatchObject({ mode: "smart", query: "" });
		expect(parseInput("sc values", modes)).toMatchObject({
			mode: "smart",
			query: "values",
		});
	});
});

describe("Tab prefix", () => {
	it("switches to tab search only after t followed by a space", () => {
		expect(parseInput("t", modes)).toMatchObject({ mode: "file", query: "t" });
		expect(parseInput("t ", modes)).toMatchObject({ mode: "tab", query: "" });
		expect(parseInput("t daily", modes)).toMatchObject({ mode: "tab", query: "daily" });
	});
});

describe("Related note prefixes", () => {
	it("switches to outgoing-link search with the o prefix", () => {
		expect(parseInput("o ", modes)).toMatchObject({ mode: "link", query: "" });
		expect(parseInput("o project", modes)).toMatchObject({
			mode: "link",
			query: "project",
		});
	});

	it("switches to backlink search with b without colliding with bookmarks", () => {
		expect(parseInput("b project", modes)).toMatchObject({
			mode: "backlink",
			query: "project",
		});
		expect(parseInput("bk project", modes)).toMatchObject({ mode: "bookmark" });
	});
});

it("classifies history by mode and Everything scope", () => {
	expect(getSearchHistoryCategory(parseInput("report", modes))).toBe("file");
	expect(getSearchHistoryCategory(parseInput("> report", modes))).toBe("command");
	expect(getSearchHistoryCategory(parseInput("e report", modes))).toBe("everything");
	expect(getSearchHistoryCategory(parseInput("esdir report", modes))).toBe(
		"everything-directory",
	);
});
