import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export interface GitCommit {
	hash: string;
	parents: string[];
	date: string;
	author: string;
	subject: string;
}

export interface GitChange {
	status: string;
	path: string;
	oldPath?: string;
}

export async function git(cwd: string, args: string[], signal?: AbortSignal): Promise<Buffer> {
	const { stdout } = await exec("git", ["-c", "core.quotepath=false", ...args], {
		cwd,
		encoding: "buffer",
		maxBuffer: 32 * 1024 * 1024,
		timeout: 30_000,
		windowsHide: true,
		signal,
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
	});
	return stdout;
}

export async function listCommits(root: string, signal?: AbortSignal): Promise<GitCommit[]> {
	const output = await git(
		root,
		["log", "--all", "HEAD", "--date-order", "-z", "--format=%H%x00%P%x00%aI%x00%an%x00%s"],
		signal,
	);
	const fields = output.toString("utf8").split("\0");
	const commits: GitCommit[] = [];
	for (let i = 0; i + 4 < fields.length; i += 5) {
		const [hash, parents, date, author, subject] = fields.slice(i, i + 5);
		if (HASH.test(hash))
			commits.push({
				hash,
				parents: parents ? parents.split(" ") : [],
				date,
				author,
				subject,
			});
	}
	return commits;
}

export async function listChanges(
	root: string,
	commit: Pick<GitCommit, "hash" | "parents">,
	signal?: AbortSignal,
): Promise<GitChange[]> {
	validateHash(commit.hash);
	const parent = commit.parents[0];
	if (parent) validateHash(parent);
	const args = parent
		? ["diff", "--no-ext-diff", "--name-status", "-z", "-M", parent, commit.hash, "--"]
		: ["diff-tree", "--root", "--no-commit-id", "-r", "--name-status", "-z", "-M", commit.hash];
	const fields = (await git(root, args, signal)).toString("utf8").split("\0");
	const changes: GitChange[] = [];
	for (let i = 0; i < fields.length && fields[i];) {
		const status = fields[i++];
		const first = fields[i++];
		if (!first) break;
		if (status.startsWith("R") || status.startsWith("C")) {
			const path = fields[i++];
			if (path) changes.push({ status, path, oldPath: first });
		} else changes.push({ status, path: first });
	}
	return changes;
}

export function contentReference(
	commit: Pick<GitCommit, "hash" | "parents">,
	change: GitChange,
): { hash: string; path: string } {
	if (change.status.startsWith("D")) {
		if (!commit.parents[0]) throw new Error("削除前のコミットがありません。");
		return { hash: commit.parents[0], path: change.path };
	}
	return { hash: commit.hash, path: change.path };
}

export function validateHash(hash: string): void {
	if (!HASH.test(hash)) throw new Error("コミットハッシュが正しくありません。");
}

export async function readVersion(root: string, hash: string, path: string): Promise<string> {
	validateHash(hash);
	if (!path || path.includes("\0")) throw new Error("ファイルパスが正しくありません。");
	const data = await git(root, ["show", "--no-textconv", `${hash}:${path}`]);
	if (data.includes(0)) throw new Error("バイナリーファイルはテキストとして表示できません。");
	return new TextDecoder("utf-8", { fatal: true }).decode(data);
}

export function obsidianGitUri(vault: string, hash: string, path: string): string {
	validateHash(hash);
	const params = new URLSearchParams({ vault, commit: hash, path });
	return `obsidian://my-palette-git?${params.toString().replaceAll("+", "%20")}`;
}

export function githubFileUri(remote: string, hash: string, path: string): string | undefined {
	validateHash(hash);
	const match = remote
		.trim()
		.match(
			/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
		);
	if (!match) return undefined;
	return `https://github.com/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}/blob/${hash}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
