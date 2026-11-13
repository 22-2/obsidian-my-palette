import type { WorkspaceLeaf } from "obsidian";
import type { GitDiffState } from "src/features/git/gitDiffState";

export const GIT_DIFF_VIEW = "my-palette-git-diff";

export async function openGitDiff(leaf: WorkspaceLeaf, state: GitDiffState): Promise<void> {
	await leaf.setViewState({ type: GIT_DIFF_VIEW, active: true, state: { ...state } });
	await leaf.view.app.workspace.revealLeaf(leaf);
}
