import type { GitChange } from "src/features/git/gitClient";

export interface GitDiffSide {
	hash?: string;
	path: string;
}
export interface GitDiffState {
	left: GitDiffSide;
	right: GitDiffSide;
}

export function gitDiffState(
	hash: string,
	parents: readonly string[],
	change: GitChange,
): GitDiffState {
	return {
		left: {
			hash: change.status.startsWith("A") ? undefined : parents[0],
			path: change.oldPath ?? change.path,
		},
		right: { hash: change.status.startsWith("D") ? undefined : hash, path: change.path },
	};
}
