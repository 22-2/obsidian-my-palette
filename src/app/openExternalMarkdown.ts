import type { WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import { EXTERNAL_MARKDOWN_VIEW_TYPE, ExternalMarkdownView } from "src/views/ExternalMarkdownView";

/**
 * External Markdown leaf reuse is a workspace concern, so keep it outside the
 * Plugin class while retaining the public method used by palette actions.
 */
export async function openExternalMarkdown(
	plugin: MyPalettePlugin,
	absolutePath: string,
	action: "primary" | "alternate" | "vertical" | "horizontal",
	autoFocus = true,
	active = true,
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
				(leaf) => leaf.view instanceof ExternalMarkdownView && leaf.view.isPreview(),
			)
		: undefined;
	const leaf: WorkspaceLeaf =
		previewLeaf ??
		(action === "alternate"
			? plugin.app.workspace.getLeaf("tab")
			: action === "horizontal"
				? plugin.app.workspace.getLeaf("split", "horizontal")
				: action === "vertical"
					? plugin.app.workspace.getLeaf("split", "vertical")
					: plugin.app.workspace.getLeaf(false));
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
