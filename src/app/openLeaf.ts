import type { App, WorkspaceLeaf } from "obsidian";

export type LeafOpenAction = "primary" | "alternate" | "vertical" | "horizontal";

/**
 * Resolves the leaf an open action may write to.
 *
 * A pinned leaf is a user-protected workspace surface. Falling back to
 * `getLeaf(false)` lets Obsidian choose an existing navigable leaf or create
 * one, so callers do not need to duplicate the pinned-leaf rule.
 */
export function getLeafForAction(
	app: App,
	action: LeafOpenAction,
	targetLeaf?: WorkspaceLeaf,
): WorkspaceLeaf {
	if (action === "primary" && targetLeaf && !isPinnedLeaf(targetLeaf)) return targetLeaf;
	return action === "alternate"
		? app.workspace.getLeaf("tab")
		: action === "horizontal"
			? app.workspace.getLeaf("split", "horizontal")
			: action === "vertical"
				? app.workspace.getLeaf("split", "vertical")
				: app.workspace.getLeaf(false);
}

export function isPinnedLeaf(leaf: WorkspaceLeaf): boolean {
	return leaf.getViewState().pinned === true;
}
