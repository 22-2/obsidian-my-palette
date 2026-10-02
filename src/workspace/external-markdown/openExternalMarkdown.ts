import type { App, WorkspaceLeaf } from "obsidian";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { getLeafForAction, revealOpenedLeaf, type LeafOpenAction } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";

const MARKDOWN_VIEW_TYPE = "markdown";
const EXTERNAL_FILE_PREFIX = "file:";

/** Native Markdown views can represent files outside the Vault via a file URI. */
export function isExternalMarkdownLeaf(leaf: WorkspaceLeaf): boolean {
	if (leaf.view.getViewType() !== MARKDOWN_VIEW_TYPE) return false;
	const file = leaf.view.getState().file;
	return typeof file === "string" && file.toLocaleLowerCase().startsWith(EXTERNAL_FILE_PREFIX);
}

export function getExternalMarkdownLeaves(app: App): WorkspaceLeaf[] {
	return app.workspace
		.getLeavesOfType(MARKDOWN_VIEW_TYPE)
		.filter((leaf) => isExternalMarkdownLeaf(leaf));
}

/**
 * External Markdown leaf reuse is a workspace concern, so keep it outside the
 * Plugin class while retaining the public method used by palette actions.
 */
export async function openExternalMarkdown(
	plugin: MyPalettePlugin,
	absolutePath: string,
	action: LeafOpenAction,
	autoFocus = true,
	active = true,
	targetLeaf?: WorkspaceLeaf,
): Promise<void> {
	const resolvedPath = getDesktopAdapter(plugin.app).path.resolve(absolutePath);
	const externalLeaves = getExternalMarkdownLeaves(plugin.app);
	const existing = externalLeaves.find(
		(leaf) => externalPathOf(leaf)?.toLocaleLowerCase() === resolvedPath.toLocaleLowerCase(),
	);
	if (existing) {
		// Why: a native Markdown leaf already owns this external path, so reopening
		// it should navigate to that tab instead of creating a duplicate leaf.
		await existing.setViewState({
			type: MARKDOWN_VIEW_TYPE,
			active: true,
			state: markdownViewState(resolvedPath),
		});
		// Reused external notes still navigate to their existing tab; await its
		// load and honor preview focus just as we do for a newly opened note.
		await revealOpenedLeaf(plugin.app, existing, autoFocus);
		return;
	}
	const leaf: WorkspaceLeaf = getLeafForAction(plugin.app, action, targetLeaf);
	await leaf.setViewState({
		type: MARKDOWN_VIEW_TYPE,
		active,
		state: markdownViewState(resolvedPath),
	});
	if (active) await revealOpenedLeaf(plugin.app, leaf, autoFocus);
}

function markdownViewState(absolutePath: string): Record<string, unknown> {
	return {
		file: `${EXTERNAL_FILE_PREFIX}${absolutePath}`,
		mode: "source",
		source: false,
	};
}

function externalPathOf(leaf: WorkspaceLeaf): string | undefined {
	const file = leaf.view.getState().file;
	if (typeof file !== "string" || !file.toLocaleLowerCase().startsWith(EXTERNAL_FILE_PREFIX))
		return undefined;
	return file.slice(EXTERNAL_FILE_PREFIX.length);
}
