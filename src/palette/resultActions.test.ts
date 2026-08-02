import { describe, expect, it } from "vitest";
import { isMarkdownPath } from "../core/externalFiles";

describe("isMarkdownPath", () => {
	it("recognizes Markdown paths without case sensitivity", () => {
		expect(isMarkdownPath("C:\\notes\\outside.md")).toBe(true);
		expect(isMarkdownPath("C:\\notes\\outside.MD")).toBe(true);
	});

	it("does not treat Markdown-looking suffixes as Markdown files", () => {
		expect(isMarkdownPath("C:\\notes\\outside.md.txt")).toBe(false);
		expect(isMarkdownPath("C:\\notes\\outside.canvas")).toBe(false);
	});
});
