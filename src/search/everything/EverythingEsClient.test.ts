import { describe, expect, it } from "vitest";
import { parseEsJson } from "src/search/everything/EverythingEsClient";

describe("parseEsJson", () => {
	it("returns no results for empty output", () => {
		expect(parseEsJson("")).toEqual([]);
	});

	it("classifies files and folders by the directory attribute", () => {
		const results = parseEsJson(
			JSON.stringify([
				{ filename: "C:\\Vault\\note.md", attributes: 32 },
				{ filename: "C:\\Vault\\ガチ未分類\\", attributes: 16 },
				{ filename: "relative.md", attributes: 32 },
				{ attributes: 32 },
			]),
		);
		expect(results.map((r) => [r.absolutePath, r.kind, r.primary, r.secondary])).toEqual([
			["C:\\Vault\\note.md", "file", "note.md", "C:\\Vault"],
			["C:\\Vault\\ガチ未分類", "folder", "ガチ未分類", "C:\\Vault"],
		]);
	});

	it("rejects output that is not a JSON array", () => {
		expect(() => parseEsJson("{}")).toThrow();
		expect(() => parseEsJson("not json")).toThrow();
	});
});
