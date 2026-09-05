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
 * The boolean result lets the caller commit search history only after an open
 * actually succeeded.
 */
export async function openPaletteResultInBackground(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<boolean> {
	const opened = await openPaletteResultInBackgroundInternal(plugin, result);
	if (opened) {
		// Record only after the host accepted the open, so failed or unsupported
		// results cannot teach the ranking about a note the user never saw.
		plugin.recordResultUsage(result);
	}
	return opened;
}

async function openPaletteResultInBackgroundInternal(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<boolean> {
	if (result.mode === "command") return false;
	if (result.mode === "bookmark") {
		if (result.kind === "search" && result.query) {
			await plugin.app.workspace.openLinkText(result.query, "", "tab", { active: false });
			return true;
		}
		if (!result.file) return false;
		await openFileInBackground(plugin, result.file);
		return true;
	}
	if (result.mode === "file") {
		const ignored = result.ignored || isUserIgnoredPath(plugin.app, result.vaultPath);
		if (ignored) {
			const absolutePath = getVaultFullPath(plugin.app, result.vaultPath);
			if (!absolutePath) {
				new Notice("This vault adapter cannot resolve an absolute path.");
				return false;
			}
			try {
				await getDesktopAdapter(plugin.app).fs.promises.stat(absolutePath);
			} catch {
				new Notice("The selected path no longer exists.");
				return false;
			}
			const target = resolveExternalOpenTarget(absolutePath, {
				openMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
				ignored: true,
			});
			if (target.kind === "readonly-markdown") {
				await plugin.openExternalMarkdown(absolutePath, "primary", true, false);
				return true;
			}
			new Notice("This item cannot be opened in a background Obsidian tab.");
			return false;
		}
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		if (!(file instanceof TFile)) {
			new Notice("The file no longer exists.");
			return false;
		}
		await openFileInBackground(plugin, file);
		return true;
	}
	if (result.mode === "link" || result.mode === "backlink" || result.mode === "smart") {
		await openFileInBackground(plugin, result.file);
		return true;
	}
	if (result.mode !== "everything") return false;
	try {
		await getDesktopAdapter(plugin.app).fs.promises.stat(result.absolutePath);
	} catch {
		new Notice("The selected path no longer exists.");
		return false;
	}
	if (result.vaultPath) {
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		if (file instanceof TFile) {
			await openFileInBackground(plugin, file);
			return true;
		}
	}
	const target = resolveExternalOpenTarget(result.absolutePath, {
		openMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
		ignored:
			Boolean(result.vaultPath) || isAbsolutePathUserIgnored(plugin.app, result.absolutePath),
	});
	if (target.kind === "readonly-markdown") {
		await plugin.openExternalMarkdown(result.absolutePath, "primary", true, false);
		return true;
	}
	new Notice("This item cannot be opened in a background Obsidian tab.");
	return false;
}

async function openFileInBackground(plugin: MyPalettePlugin, file: TFile): Promise<void> {
	await plugin.app.workspace.getLeaf("tab").openFile(file, { active: false });
}
