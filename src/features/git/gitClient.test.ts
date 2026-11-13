import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	contentReference,
	git,
	githubFileUri,
	listChanges,
	listCommits,
	obsidianGitUri,
	readVersion,
} from "src/features/git/gitClient";

let root = "";
afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
	root = "";
});

describe("Git history", () => {
	it("reads root, renamed and deleted files with their exact historical contents", async () => {
		root = await mkdtemp(join(tmpdir(), "palette-git-"));
		await git(root, ["init"]);
		await git(root, ["config", "user.name", "Tester"]);
		await git(root, ["config", "user.email", "test@example.com"]);
		await writeFile(join(root, "古い & 名前.md"), "元の内容\n");
		await git(root, ["add", "--all"]);
		await git(root, ["commit", "-m", "追加"]);
		await rename(join(root, "古い & 名前.md"), join(root, "新しい名前.md"));
		await git(root, ["add", "--all"]);
		await git(root, ["commit", "-m", "移動"]);
		await rm(join(root, "新しい名前.md"));
		await git(root, ["add", "--all"]);
		await git(root, ["commit", "-m", "削除"]);
		const commits = await listCommits(root);
		expect(commits.map((commit) => commit.subject)).toEqual(["削除", "移動", "追加"]);
		const [deleted, moved, added] = commits;
		expect(await listChanges(root, added)).toEqual([{ status: "A", path: "古い & 名前.md" }]);
		expect(await listChanges(root, moved)).toEqual([
			{ status: "R100", path: "新しい名前.md", oldPath: "古い & 名前.md" },
		]);
		const [change] = await listChanges(root, deleted);
		expect(change).toEqual({ status: "D", path: "新しい名前.md" });
		const ref = contentReference(deleted, change);
		expect(ref.hash).toBe(moved.hash);
		expect(await readVersion(root, ref.hash, ref.path)).toBe("元の内容\n");
	}, 20_000);

	it("creates stable, encoded links and rejects invalid revisions", () => {
		const hash = "a".repeat(40);
		const uri = new URL(obsidianGitUri("小説 vault", hash, "資料/設定 & 旧.md"));
		expect(uri.toString()).not.toContain("+");
		expect(uri.searchParams.get("vault")).toBe("小説 vault");
		expect(uri.searchParams.get("path")).toBe("資料/設定 & 旧.md");
		expect(uri.searchParams.get("commit")).toBe(hash);
		expect(githubFileUri("git@github.com:user/repo.git", hash, "資料/a b.md")).toBe(
			`https://github.com/user/repo/blob/${hash}/%E8%B3%87%E6%96%99/a%20b.md`,
		);
		expect(githubFileUri("https://example.com/user/repo.git", hash, "a.md")).toBeUndefined();
		expect(() => obsidianGitUri("v", "HEAD", "a.md")).toThrow();
	});
});
