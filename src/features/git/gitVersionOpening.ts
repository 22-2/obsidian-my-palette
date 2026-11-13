import type { WorkspaceLeaf } from "obsidian";

export const GIT_VERSION_VIEW = "my-palette-git-version";

export async function openGitVersion(
	leaf: WorkspaceLeaf,
	hash: string,
	path: string,
): Promise<void> {
	await leaf.setViewState({ type: GIT_VERSION_VIEW, active: true, state: { hash, path } });
	await leaf.view.app.workspace.revealLeaf(leaf);
}
