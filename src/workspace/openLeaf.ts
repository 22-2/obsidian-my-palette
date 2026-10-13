import type { App, TFile, WorkspaceLeaf } from "obsidian";

export type LeafOpenAction = "primary" | "alternate" | "vertical" | "horizontal";

export interface OpenFileOptions {
	action: LeafOpenAction;
	/** The本文 leaf that a primary open replaces; ignored when it is pinned. */
	targetLeaf?: WorkspaceLeaf;
	/** Background opens load the file without activating its leaf. */
	active: boolean;
	/** Preview opens reveal the leaf but keep keyboard focus where it was. */
	autoFocus: boolean;
	/** Reveal the tab that already shows the file instead of opening another one. */
	focusExisting: boolean;
}

/**
 * The single path that opens a vault file from a palette result or a related-note
 * action. Every file open goes through here so that tab reuse is decided once.
 */
export async function openFileInLeaf(
	app: App,
	file: TFile,
	options: OpenFileOptions,
): Promise<WorkspaceLeaf> {
	const existing = options.focusExisting ? findLeafShowingFile(app, file) : undefined;
	if (existing) {
		// Why: a background open must not switch the user's tab when the note is
		// already visible somewhere, so only an active open reveals the existing leaf.
		if (options.active) await revealOpenedLeaf(app, existing, options.autoFocus);
		return existing;
	}
	const leaf = getLeafForAction(app, options.action, options.targetLeaf);
	await leaf.openFile(file, { active: options.active });
	if (options.active) await revealOpenedLeaf(app, leaf, options.autoFocus);
	return leaf;
}

/** Finds the first leaf whose view is currently showing `file`. */
export function findLeafShowingFile(app: App, file: TFile): WorkspaceLeaf | undefined {
	let found: WorkspaceLeaf | undefined;
	app.workspace.iterateAllLeaves((leaf) => {
		if (!found && (leaf.view as { file?: TFile | null }).file?.path === file.path) found = leaf;
	});
	return found;
}

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

/** Reveal the actual destination before focusing its fully loaded view. */
export async function revealOpenedLeaf(
	app: App,
	leaf: WorkspaceLeaf,
	autoFocus = true,
): Promise<void> {
	// Deferred tabs need to finish loading before they can receive editor focus.
	// Preview actions reveal the note too, but keep keyboard focus in the palette.
	await app.workspace.revealLeaf(leaf);
	if (autoFocus) app.workspace.setActiveLeaf(leaf, { focus: true });
}
