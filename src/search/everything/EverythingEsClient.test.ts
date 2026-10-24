import { describe, expect, it } from "vitest";
import { parseEsJson } from "src/search/everything/EverythingEsClient";

describe("解析EsJson", () => {
	it("空の出力の場合は結果を返しません", () => {
		expect(parseEsJson("")).toEqual([]);
	});

	it("ファイルとフォルダーをディレクトリ属性によって分類します", () => {
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

	it("JSON 配列ではない出力を拒否します", () => {
		expect(() => parseEsJson("{}")).toThrow();
		expect(() => parseEsJson("not json")).toThrow();
	});
});
