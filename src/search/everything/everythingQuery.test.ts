import { describe, expect, it } from "vitest";
import { buildEverythingQuery } from "src/search/everything/everythingQuery";

describe("buildEverythingクエリ", () => {
	it("ルートおよび拡張子による Vault 検索の制限", () => {
		expect(buildEverythingQuery("E:\\Vault", "vault", ["md", "canvas"], "note")).toBe(
			'path:"E:\\Vault" ext:md;canvas note',
		);
	});

	it("拡張子フィルターを使用せずに Vault 内でディレクトリ検索を維持します", () => {
		expect(buildEverythingQuery("E:\\Vault", "directory", [], "outside.md")).toBe(
			'path:"E:\\Vault" outside.md',
		);
	});
});
