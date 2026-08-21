import { Notice, TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import {
	getVaultFullPath,
	isAbsolutePathUserIgnored,
	isUserIgnoredPath,
} from "src/ignored-notes/ignoredPaths";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import type { PaletteResult } from "src/model/results";
import { resolveExternalOpenTarget } from "src/palette/openTargets";

/**
 * Background opening has platform and Vault checks that are unrelated to modal
 * selection state, so keep those side effects in a dedicated action module.
 */
export async function openPaletteResultInBackground(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<void> {
	if (result.mode === "command") return;
	if (result.mode === "bookmark") {
		if (result.kind === "search" && result.query) {
			await plugin.app.workspace.openLinkText(result.query, "", "tab", { active: false });
			return;
		}
		if (result.file) await openFileInBackground(plugin, result.file);
		return;
	}
	if (result.mode === "file") {
		const ignored = result.ignored || isUserIgnoredPath(plugin.app, result.vaultPath);
		if (ignored) {
			const absolutePath = getVaultFullPath(plugin.app, result.vaultPath);
			if (!absolutePath) {
				new Notice("This vault adapter cannot resolve an absolute path.");
				return;
			}
			try {
				await getDesktopAdapter(plugin.app).fs.promises.stat(absolutePath);
			} catch {
				new Notice("The selected path no longer exists.");
				return;
			}
			const target = resolveExternalOpenTarget(absolutePath, {
				openMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
				ignored: true,
			});
			if (target.kind === "readonly-markdown") {
				await plugin.openExternalMarkdown(absolutePath, "primary", true, false);
				return;
			}
			new Notice("This item cannot be opened in a background Obsidian tab.");
			return;
		}
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		if (file instanceof TFile) await openFileInBackground(plugin, file);
		else new Notice("The file no longer exists.");
		return;
	}
	if (result.mode === "link" || result.mode === "backlink" || result.mode === "smart") {
		await openFileInBackground(plugin, result.file);
		return;
	}
	if (result.mode !== "everything") return;
	try {
		await getDesktopAdapter(plugin.app).fs.promises.stat(result.absolutePath);
	} catch {
		new Notice("The selected path no longer exists.");
		return;
	}
	if (result.vaultPath) {
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		if (file instanceof TFile) {
			await openFileInBackground(plugin, file);
			return;
		}
	}
	const target = resolveExternalOpenTarget(result.absolutePath, {
		openMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
		ignored:
			Boolean(result.vaultPath) || isAbsolutePathUserIgnored(plugin.app, result.absolutePath),
	});
	if (target.kind === "readonly-markdown") {
		await plugin.openExternalMarkdown(result.absolutePath, "primary", true, false);
		return;
	}
	new Notice("This item cannot be opened in a background Obsidian tab.");
}

async function openFileInBackground(plugin: MyPalettePlugin, file: TFile): Promise<void> {
	await plugin.app.workspace.getLeaf("tab").openFile(file, { active: false });
}
