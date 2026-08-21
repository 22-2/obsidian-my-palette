import { describe, expect, it } from "vitest";
import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";

const prefixes = { command: ">", everything: "e ", includeIgnored: "i " };

describe("include ignored prefix", () => {
	it("opts file searches into the ignored index", () => {
		expect(parseInput("i old meeting", prefixes)).toMatchObject({
			mode: "file",
			query: "old meeting",
			includeIgnored: true,
		});
	});

	it("keeps the ignored scope when the query is empty", () => {
		expect(parseInput("i ", prefixes)).toMatchObject({
			mode: "file",
			query: "",
			includeIgnored: true,
		});
	});

	it("can wrap another palette prefix", () => {
		expect(parseInput("i > old", prefixes)).toMatchObject({
			mode: "command",
			query: "old",
			includeIgnored: true,
		});
	});

	it("requires the trailing space", () => {
		expect(parseInput("index", prefixes)).toMatchObject({
			mode: "file",
			query: "index",
			includeIgnored: false,
		});
	});
});

describe("parseInput Everything scopes", () => {
	it("requires a trailing space before switching Everything modes", () => {
		expect(parseInput("es", prefixes)).toMatchObject({ mode: "file", query: "es" });
		expect(parseInput("es ", prefixes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "vault",
		});
	});

	it("preserves native Everything syntax after es", () => {
		expect(parseInput('es content:"e"', prefixes)).toMatchObject({
			query: 'content:"e"',
			everythingScope: "vault",
		});
	});

	it("requires a trailing space before switching directory-scoped Everything", () => {
		expect(parseInput("esdir", prefixes)).toMatchObject({
			mode: "file",
			query: "esdir",
		});
		expect(parseInput("esdir ", prefixes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
	});

	it("does not treat ordinary words starting with es as a prefix", () => {
		expect(parseInput("estate", prefixes)).toMatchObject({ mode: "file", query: "estate" });
	});
});

it("requires a trailing space before switching command mode", () => {
	expect(parseInput(">", prefixes)).toMatchObject({ mode: "file", query: ">" });
	expect(parseInput("> ", prefixes)).toMatchObject({
		mode: "command",
		query: "",
	});
});

describe("Bookmark prefix", () => {
	it("switches to bookmark search only after b followed by a space", () => {
		expect(parseInput("b", prefixes)).toMatchObject({ mode: "file", query: "b" });
		expect(parseInput("b ", prefixes)).toMatchObject({ mode: "bookmark", query: "" });
		expect(parseInput("b project", prefixes)).toMatchObject({
			mode: "bookmark",
			query: "project",
		});
	});

	it("does not treat ordinary words beginning with b as a prefix", () => {
		expect(parseInput("book", prefixes)).toMatchObject({ mode: "file", query: "book" });
	});
});

describe("Smart Connections prefix", () => {
	it("switches to Smart Connections search only after sc followed by a space", () => {
		expect(parseInput("sc", prefixes)).toMatchObject({ mode: "file", query: "sc" });
		expect(parseInput("sc ", prefixes)).toMatchObject({ mode: "smart", query: "" });
		expect(parseInput("sc values", prefixes)).toMatchObject({
			mode: "smart",
			query: "values",
		});
	});
});

it("classifies history by mode and Everything scope", () => {
	expect(getSearchHistoryCategory(parseInput("report", prefixes))).toBe("file");
	expect(getSearchHistoryCategory(parseInput("> report", prefixes))).toBe("command");
	expect(getSearchHistoryCategory(parseInput("e report", prefixes))).toBe("everything");
	expect(getSearchHistoryCategory(parseInput("esdir report", prefixes))).toBe(
		"everything-directory",
	);
});
