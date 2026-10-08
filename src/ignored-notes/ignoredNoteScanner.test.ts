import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { collectVaultPaths, mapWithConcurrency } from "src/ignored-notes/ignoredNoteScanner";

type Node = { type: "file" } | { type: "folder"; files: string[]; folders: string[] };

function appWith(tree: Record<string, Node>, failOn: Record<string, unknown> = {}) {
	const adapter = {
		stat: vi.fn(async (path: string) => {
			if (path in failOn) throw failOn[path];
			return tree[path] ? { type: tree[path].type } : null;
		}),
		list: vi.fn(async (path: string) => {
			const node = tree[path];
			if (node?.type !== "folder") throw new Error("not a folder");
			return { files: node.files, folders: node.folders };
		}),
	};
	return { app: { vault: { adapter } } as unknown as App, adapter };
}

describe("collectVaultPaths", () => {
	it("walks folders recursively and accepts a file root", async () => {
		const { app } = appWith({
			a: { type: "folder", files: ["a/1.md"], folders: ["a/b"] },
			"a/b": { type: "folder", files: ["a/b/2.md"], folders: [] },
			"c.md": { type: "file" },
		});
		const files = await collectVaultPaths(app, ["a", "c.md"], vi.fn());
		expect(files.toSorted()).toEqual(["a/1.md", "a/b/2.md", "c.md"]);
	});

	it("skips a missing root without listing it", async () => {
		const { app, adapter } = appWith({});
		const log = vi.fn();
		expect(await collectVaultPaths(app, ["gone"], log)).toEqual([]);
		expect(adapter.list).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith("Skipped missing ignored folder", { folder: "gone" });
	});

	it("treats ENOENT as missing and keeps scanning other roots", async () => {
		const { app } = appWith(
			{ ok: { type: "folder", files: ["ok/1.md"], folders: [] } },
			{ racy: Object.assign(new Error("gone"), { code: "ENOENT" }) },
		);
		expect(await collectVaultPaths(app, ["racy", "ok"], vi.fn())).toEqual(["ok/1.md"]);
	});

	it("logs other errors and continues", async () => {
		const { app } = appWith(
			{ ok: { type: "folder", files: ["ok/1.md"], folders: [] } },
			{ bad: new Error("locked") },
		);
		const log = vi.fn();
		expect(await collectVaultPaths(app, ["bad", "ok"], log)).toEqual(["ok/1.md"]);
		expect(log).toHaveBeenCalledWith("Failed to list ignored folder", expect.anything());
	});

	it("does not visit a duplicated root twice", async () => {
		const { app, adapter } = appWith({ a: { type: "folder", files: [], folders: [] } });
		await collectVaultPaths(app, ["a", "a"], vi.fn());
		expect(adapter.list).toHaveBeenCalledTimes(1);
	});
});

describe("mapWithConcurrency", () => {
	it("keeps result order and never exceeds the concurrency limit", async () => {
		let running = 0;
		let peak = 0;
		const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
			running += 1;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 5 - n));
			running -= 1;
			return n * 10;
		});
		expect(results).toEqual([10, 20, 30, 40, 50]);
		expect(peak).toBeLessThanOrEqual(2);
	});
});
