import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { applyTagRename, findTagRenameTargets } from "src/tags/tagRenameFiles";

vi.mock("obsidian", () => ({
	parseFrontMatterTags: (frontmatter: { tags?: unknown } | undefined) =>
		Array.isArray(frontmatter?.tags) ? frontmatter.tags : undefined,
	parseFrontMatterAliases: (frontmatter: { aliases?: unknown } | undefined) =>
		Array.isArray(frontmatter?.aliases) ? frontmatter.aliases : undefined,
}));

interface FakeNote {
	file: TFile;
	text: string;
	frontmatter: Record<string, unknown>;
	/** メタデータキャッシュの本文タグ。作成時の本文の位置を持ち、本文を後から変えてもずれたままになる。 */
	tags: { tag: string; start: number; end: number }[];
}

function note(path: string, text: string, frontmatter: Record<string, unknown> = {}): FakeNote {
	const tags = [...text.matchAll(/#[^\s,.#]+/g)].map((match) => ({
		tag: match[0],
		start: match.index,
		end: match.index + match[0].length,
	}));
	return { file: { path } as TFile, text, frontmatter, tags };
}

function makeApp(notes: FakeNote[]) {
	const byPath = new Map(notes.map((item) => [item.file.path, item]));
	const cacheOf = (item: FakeNote) => ({
		frontmatter: item.frontmatter,
		tags: item.tags.map(({ tag, start, end }) => ({
			tag,
			position: { start: { offset: start }, end: { offset: end } },
		})),
	});
	const app = {
		vault: {
			getMarkdownFiles: () => notes.map((item) => item.file),
			process: async (file: TFile, fn: (text: string) => string) => {
				const item = byPath.get(file.path)!;
				item.text = fn(item.text);
			},
		},
		metadataCache: {
			getFileCache: (file: TFile) => cacheOf(byPath.get(file.path)!),
		},
		fileManager: {
			processFrontMatter: async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				fn(byPath.get(file.path)!.frontmatter);
			},
		},
	};
	return app as unknown as App;
}

describe("findTagRenameTargets", () => {
	it("finds notes with the tag inline, in frontmatter tags, or in aliases", () => {
		const notes = [
			note("inline.md", "text #old"),
			note("fm.md", "text", { tags: ["old/child"] }),
			note("alias.md", "text", { aliases: ["#old"] }),
			note("none.md", "text #keep"),
		];
		const app = makeApp(notes);
		expect(findTagRenameTargets(app, "old").map((file) => file.path)).toEqual([
			"inline.md",
			"fm.md",
			"alias.md",
		]);
	});
});

describe("applyTagRename", () => {
	it("rewrites inline tags and frontmatter together", async () => {
		const item = note("a.md", "Body #old and #old/x", { tags: ["old"], aliases: ["#old"] });
		const app = makeApp([item]);
		const outcome = await applyTagRename(app, item.file, "old", "new");
		expect(outcome).toBe("changed");
		expect(item.text).toBe("Body #new and #new/x");
		expect(item.frontmatter).toEqual({ tags: ["new"], aliases: ["#new"] });
	});

	it("reports unchanged when nothing matches the tag", async () => {
		const item = note("a.md", "Body #keep", { tags: ["keep"] });
		const app = makeApp([item]);
		expect(await applyTagRename(app, item.file, "old", "new")).toBe("unchanged");
		expect(item.text).toBe("Body #keep");
	});

	it("skips the note without frontmatter changes when the body moved since it was read", async () => {
		const item = note("a.md", "Body #old", { tags: ["old"] });
		const app = makeApp([item]);
		item.text = "Edited #other text";
		const outcome = await applyTagRename(app, item.file, "old", "new");
		expect(outcome).toBe("stale");
		expect(item.text).toBe("Edited #other text");
		expect(item.frontmatter).toEqual({ tags: ["old"] });
	});
});
