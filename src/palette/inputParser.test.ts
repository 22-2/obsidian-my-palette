import { describe, expect, it } from "vitest";
import { parseInput } from "./inputParser";

const prefixes = { command: ">", everything: "e " };

describe("parseInput Everything scopes", () => {
	it("treats an empty es query as Vault-scoped Everything", () => {
		expect(parseInput("es", prefixes)).toMatchObject({
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

	it("treats an empty esdir query as directory-scoped Everything", () => {
		expect(parseInput("esdir", prefixes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
	});

	it("does not treat ordinary words starting with es as a prefix", () => {
		expect(parseInput("estate", prefixes)).toMatchObject({ mode: "file", query: "estate" });
	});
});

it("treats a command prefix followed by a space as an empty command query", () => {
	expect(parseInput("> ", prefixes)).toMatchObject({
		mode: "command",
		query: "",
	});
});

describe("Bookmark prefix", () => {
	it("switches to bookmark search for b and b queries", () => {
		expect(parseInput("b", prefixes)).toMatchObject({ mode: "bookmark", query: "" });
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
	it("switches to Smart Connections search for sc and sc queries", () => {
		expect(parseInput("sc", prefixes)).toMatchObject({ mode: "smart", query: "" });
		expect(parseInput("sc values", prefixes)).toMatchObject({
			mode: "smart",
			query: "values",
		});
	});
});
