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
