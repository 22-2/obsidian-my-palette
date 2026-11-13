import type { App } from "obsidian";
import type { PaletteProvider, PaletteSearchRequest } from "src/core/PaletteProvider";
import type { GitCommitResult } from "src/core/results";
import { searchFuzzyQuery } from "src/core/fuzzyQuery";
import { listCommits } from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";

export class GitProvider implements PaletteProvider<GitCommitResult> {
	constructor(private readonly app: App) {}

	async search({ query, signal }: PaletteSearchRequest): Promise<GitCommitResult[]> {
		const root = await repositoryRoot(this.app, signal);
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
				primary: commit.subject,
				secondary: `${commit.hash.slice(0, 8)} · ${commit.date.slice(0, 10)} · ${commit.author}`,
				icon: "git-commit-horizontal",
				hash: commit.hash,
				parents: commit.parents,
			}));
	}
}
