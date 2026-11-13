import type { App } from "obsidian";
import type { PaletteProvider, PaletteSearchRequest } from "src/core/PaletteProvider";
import type { GitCommitResult, GitFileResult } from "src/core/results";
import { searchFuzzyQuery } from "src/core/fuzzyQuery";
import { listChanges, listCommits } from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";

export class GitProvider implements PaletteProvider<GitCommitResult | GitFileResult> {
	constructor(private readonly app: App) {}

	async search({
		query,
		signal,
		gitCommit,
	}: PaletteSearchRequest): Promise<(GitCommitResult | GitFileResult)[]> {
		const root = await repositoryRoot(this.app, signal);
		if (gitCommit) {
			const changes = await listChanges(root, gitCommit, signal);
			return searchFuzzyQuery(query, changes, [
				(change) => change.path,
				(change) => change.oldPath ?? "",
			]).map(({ obj: change }) => ({
				id: `git-file:${gitCommit.hash}:${change.path}`,
				mode: "git" as const,
				kind: "file" as const,
				root,
				primary: change.path.split("/").at(-1) ?? change.path,
				secondary: change.oldPath ? `${change.oldPath} → ${change.path}` : change.path,
				icon: "file",
				commit: gitCommit,
				change,
			}));
		}
		const commits = await listCommits(root, signal);
		const matched = new Set(
			searchFuzzyQuery(query, commits, [
				(commit) => commit.hash,
				(commit) => commit.subject,
				(commit) => commit.author,
				(commit) => commit.date,
			]).map(({ obj }) => obj.hash),
		);
		return commits
			.filter((commit) => matched.has(commit.hash))
			.map((commit) => ({
				id: `git:${commit.hash}`,
				mode: "git",
				kind: "commit",
				primary: commit.subject,
				secondary: `${commit.hash.slice(0, 8)} · ${commit.date.slice(0, 10)} · ${commit.author}`,
				icon: "git-commit-horizontal",
				hash: commit.hash,
				parents: commit.parents,
			}));
	}
}
