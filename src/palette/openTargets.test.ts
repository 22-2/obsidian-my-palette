import { describe, expect, it } from "vitest";
import { resolveExternalOpenTarget } from "src/palette/openTargets";

describe("resolveExternalOpenTarget", () => {
	it("uses the native Markdown target when the in-app viewer is enabled", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: true,
			}),
		).toEqual({ kind: "markdown", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("uses the system handler for Markdown when the in-app viewer is disabled", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: false,
			}),
		).toEqual({ kind: "system", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("opens an ordinary external non-Markdown path with the system handler", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\assets\\image.png", {
				openMarkdownInObsidian: true,
			}),
		).toEqual({ kind: "system", absolutePath: "C:\\vault\\assets\\image.png" });
	});
});
