import { describe, expect, it } from "vitest";
import { resolveExternalOpenTarget } from "src/palette/openTargets";

describe("解決外部オープンターゲット", () => {
	it("アプリ内ビューアが有効な場合、ネイティブの Markdown ターゲットを使用します", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: true,
			}),
		).toEqual({ kind: "markdown", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("アプリ内ビューアが無効になっている場合は、Markdown のシステム ハンドラーを使用します。", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: false,
			}),
		).toEqual({ kind: "system", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("システム ハンドラーを使用して、通常の非 Markdown 外部パスを開きます。", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\assets\\image.png", {
				openMarkdownInObsidian: true,
			}),
		).toEqual({ kind: "system", absolutePath: "C:\\vault\\assets\\image.png" });
	});
});
