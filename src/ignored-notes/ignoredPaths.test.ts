import { describe, expect, it } from "vitest";
import {
	isUserIgnoreFilterRegex,
	isUserIgnoredPathWithFilters,
} from "src/ignored-notes/ignoredPathMatching";

describe("無視されたパスフィルター", () => {
	it("スラッシュ区切りの正規表現を認識します", () => {
		expect(isUserIgnoreFilterRegex("/archive-.*/")).toBe(true);
		expect(isUserIgnoreFilterRegex("archive")).toBe(false);
	});

	it("兄弟には一致せず、リテラルのフォルダーとその子孫に一致します。", () => {
		expect(isUserIgnoredPathWithFilters(["archive"], "archive/note.md")).toBe(true);
		expect(isUserIgnoredPathWithFilters(["archive"], "archive-old/note.md")).toBe(false);
	});

	it("正規化されたパスに対して正規表現フィルターを照合します", () => {
		expect(isUserIgnoredPathWithFilters(["/\\.private\\//"], ".private/note.md")).toBe(true);
		expect(isUserIgnoredPathWithFilters(["/\\.private\\//"], "notes/note.md")).toBe(false);
	});

	it("検索を拒否するのではなく、無効な正規表現を無視します。", () => {
		expect(isUserIgnoredPathWithFilters(["/[invalid/", "archive"], "notes/note.md")).toBe(
			false,
		);
		expect(isUserIgnoredPathWithFilters(["/[invalid/", "archive"], "archive/note.md")).toBe(
			true,
		);
	});
});
