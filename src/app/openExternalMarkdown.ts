import type { WorkspaceLeaf } from "obsidian";
import { getLeafForAction, isPinnedLeaf, type LeafOpenAction } from "src/app/openLeaf";
import type MyPalettePlugin from "src/main";
import { EXTERNAL_MARKDOWN_VIEW_TYPE, ExternalMarkdownView } from "src/views/ExternalMarkdownView";

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
	const effectiveAutoFocus = autoFocus && active;
	const externalLeaves = plugin.app.workspace.getLeavesOfType(EXTERNAL_MARKDOWN_VIEW_TYPE);
	const existing = externalLeaves.find(
		(leaf) =>
			leaf.view instanceof ExternalMarkdownView &&
			leaf.view.getFilePath().toLocaleLowerCase() === absolutePath.toLocaleLowerCase(),
	);
	if (existing) {
		// A ReadOnly path has a single workspace leaf; reopening it is a navigation
		// request, so focus that existing tab even when the original action was
		// requested as a background open.
		await existing.setViewState({
			type: EXTERNAL_MARKDOWN_VIEW_TYPE,
			active: true,
			state: {
				path: absolutePath,
				autoFocus: effectiveAutoFocus,
				preview: !autoFocus && active,
			},
		});
		plugin.app.workspace.revealLeaf(existing);
		return;
	}
	const previewLeaf = !autoFocus
		? externalLeaves.find(
				(leaf) =>
					leaf.view instanceof ExternalMarkdownView &&
					leaf.view.isPreview() &&
					!isPinnedLeaf(leaf),
			)
		: undefined;
	// Preview reuse is a virtual-note-specific optimization; every other target
	// follows the same pinned-safe leaf policy as ordinary note opens.
	const leaf: WorkspaceLeaf = previewLeaf ?? getLeafForAction(plugin.app, action, targetLeaf);
	await leaf.setViewState({
		type: EXTERNAL_MARKDOWN_VIEW_TYPE,
		active,
		state: {
			path: absolutePath,
			autoFocus: effectiveAutoFocus,
			preview: !autoFocus && active,
		},
	});
	if (active) plugin.app.workspace.revealLeaf(leaf);
}
