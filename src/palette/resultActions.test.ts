import { describe, expect, it } from "vitest";
import { isMarkdownPath } from "src/shared/externalFiles";

describe("Markdownパスの判定", () => {
	it("大文字と小文字を区別せずに Markdown パスを認識します", () => {
		expect(isMarkdownPath("C:\\notes\\outside.md")).toBe(true);
		expect(isMarkdownPath("C:\\notes\\outside.MD")).toBe(true);
	});

	it("Markdown のように見えるサフィックスを Markdown ファイルとして扱いません", () => {
		expect(isMarkdownPath("C:\\notes\\outside.md.txt")).toBe(false);
		expect(isMarkdownPath("C:\\notes\\outside.canvas")).toBe(false);
	});
});
