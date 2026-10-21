import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { executeMerge, planMerge } from "src/merge/mergeNotes";

interface FakeNote {
	file: TFile;
	body: string;
	frontmatter: Record<string, unknown>;
}

/** Vault の代わりに、ファイルの内容・プロパティ・リンクの解決・ゴミ箱だけを持つ。 */
function fakeVault(notes: FakeNote[], links: Record<string, Record<string, number>>) {
	const byPath = new Map(notes.map((note) => [note.file.path, note]));
	const trashed: string[] = [];
	const app = {
		vault: {
			cachedRead: async (file: TFile) => byPath.get(file.path)?.body ?? "",
			getFileByPath: (path: string) => byPath.get(path)?.file ?? null,
			process: vi.fn(async (file: TFile, update: (content: string) => string) => {
				const note = byPath.get(file.path)!;
				note.body = update(note.body);
				return note.body;
			}),
		},
		metadataCache: {
			resolvedLinks: links,
			getFirstLinkpathDest: (linkpath: string) =>
				notes.find((note) => note.file.basename === linkpath.split("/").pop())?.file ??
				null,
			getFileCache: (file: TFile) => ({ frontmatter: byPath.get(file.path)?.frontmatter }),
		},
		fileManager: {
			processFrontMatter: vi.fn(
				async (file: TFile, update: (fm: Record<string, unknown>) => void) => {
					update(byPath.get(file.path)!.frontmatter);
				},
			),
			trashFile: vi.fn(async (file: TFile) => {
				trashed.push(file.path);
			}),
		},
	} as unknown as App;
	return { app, byPath, trashed };
}

function note(path: string, body: string, frontmatter: Record<string, unknown> = {}): FakeNote {
	const basename = path.split("/").pop()!.replace(/\.md$/, "");
	return {
		file: { path, basename, extension: "md" } as unknown as TFile,
		body,
		frontmatter,
	};
}

function scenario() {
	const a = note("a.md", "A body [[c]]\n", { status: "todo", tags: ["x"] });
	const b = note("b.md", "B body\n", { status: "done" });
	const c = note("c.md", "see [[a]] and [[b]]\n");
	const moc = note("moc.md", "- [[a]]\n- [[b]]\n");
	const links = { "c.md": { "a.md": 1, "b.md": 1 }, "moc.md": { "a.md": 1, "b.md": 1 } };
	return { ...fakeVault([a, b, c, moc], links), a, b, c, moc };
}

describe("planMerge", () => {
	it("lists the body, property conflicts, and the notes whose links move", async () => {
		const { app, a, b } = scenario();
		const plan = await planMerge(app, [a.file], b.file);

		expect(plan.body).toBe("%%b.md%%\n\nB body\n\n%%a.md%%\n\nA body [[c]]\n");
		expect(plan.conflicts).toEqual(["status"]);
		expect(plan.retargets.map((entry) => [entry.file.path, entry.count])).toEqual([
			["c.md", 1],
			["moc.md", 1],
		]);
	});
});

describe("executeMerge", () => {
	it("writes the target, moves the links, then trashes the sources", async () => {
		const { app, a, b, byPath, trashed } = scenario();
		const plan = await planMerge(app, [a.file], b.file);
		const result = await executeMerge(app, plan);

		expect(result).toEqual({ merged: true, trashed: 1, retargeted: 2, failures: [] });
		expect(byPath.get("b.md")!.body).toBe("%%b.md%%\n\nB body\n\n%%a.md%%\n\nA body [[c]]\n");
		expect(byPath.get("b.md")!.frontmatter).toEqual({
			status: "done",
			tags: ["x"],
			aliases: ["a"],
		});
		expect(byPath.get("c.md")!.body).toBe("see [[b]] and [[b]]\n");
		expect(byPath.get("moc.md")!.body).toBe("- [[b]]\n");
		expect(trashed).toEqual(["a.md"]);
	});

	it("keeps the source name out of aliases when the plan switch is off", async () => {
		const { app, a, b, byPath } = scenario();
		const plan = await planMerge(app, [a.file], b.file);
		plan.aliasSourceNames = false;

		await executeMerge(app, plan);

		expect(byPath.get("b.md")!.frontmatter).toEqual({ status: "done", tags: ["x"] });
	});

	it("touches nothing else when the target cannot be written", async () => {
		const { app, a, b, trashed } = scenario();
		const plan = await planMerge(app, [a.file], b.file);
		vi.mocked(app.fileManager.processFrontMatter).mockRejectedValueOnce(new Error("locked"));

		const result = await executeMerge(app, plan);

		expect(result.failures).toEqual(["b: locked"]);
		expect(result.merged).toBe(false);
		expect(result.trashed).toBe(0);
		expect(trashed).toEqual([]);
		expect(vi.mocked(app.vault.process)).not.toHaveBeenCalled();
	});
});
