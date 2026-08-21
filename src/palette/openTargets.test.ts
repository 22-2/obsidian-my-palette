import { describe, expect, it } from "vitest";
import { resolveExternalOpenTarget } from "src/palette/openTargets";

describe("resolveExternalOpenTarget", () => {
	it("uses the readonly Markdown target when the in-app viewer is enabled", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: true,
				ignored: true,
			}),
		).toEqual({ kind: "readonly-markdown", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("uses VS Code for ignored Markdown when the in-app viewer is disabled", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\ignored\\note.md", {
				openMarkdownInObsidian: false,
				ignored: true,
			}),
		).toEqual({ kind: "code", absolutePath: "C:\\vault\\ignored\\note.md" });
	});

	it("opens an ordinary external non-Markdown path with the system handler", () => {
		expect(
			resolveExternalOpenTarget("C:\\vault\\assets\\image.png", {
				openMarkdownInObsidian: true,
				ignored: false,
			}),
		).toEqual({ kind: "system", absolutePath: "C:\\vault\\assets\\image.png" });
	});
});
