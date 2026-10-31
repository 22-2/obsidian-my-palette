import { Notice, TFile } from "obsidian";
import { openFileInLeaf } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";
import { getVaultFullPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import type { PaletteResult } from "src/palette/results";
import { resolveExternalOpenTarget } from "src/palette/openTargets";
import { t } from "src/i18n";

/**
 * 裏で開く操作には、モーダルの選択状態とは無関係なプラットフォームと Vault の確認がある。
 * そのため、それらの副作用は専用の操作のモジュールに置く。
 * 戻り値の真偽値により、呼び出し元は開く操作が成功した後にだけ検索履歴を記録できる。
 */
export async function openPaletteResultInBackground(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<boolean> {
	const opened = await openPaletteResultInBackgroundInternal(plugin, result);
	if (opened) {
		// Why: ホストが開く操作を受け付けたあとにだけ記録する。失敗した結果や未対応の結果で、
		// ユーザーが見ていないノートをランキングが覚えないようにするため。
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
				new Notice(t("palette.error.noAbsolutePath"));
				return false;
			}
			try {
				await getDesktopAdapter(plugin.app).fs.promises.stat(absolutePath);
			} catch {
				new Notice(t("palette.error.pathGone"));
				return false;
			}
			const target = resolveExternalOpenTarget(absolutePath, {
				openMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
			});
			if (target.kind === "markdown") {
				await openExternalMarkdownInBackground(plugin, absolutePath);
				return true;
			}
			new Notice(t("palette.error.noBackgroundTab"));
			return false;
		}
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		if (!(file instanceof TFile)) {
			new Notice(t("palette.error.fileGone"));
			return false;
		}
		await openFileInBackground(plugin, file);
		return true;
	}
	if (
		result.mode === "link" ||
		result.mode === "backlink" ||
		result.mode === "heading" ||
		result.mode === "smart"
	) {
		await openFileInBackground(plugin, result.file);
		return true;
	}
	if (result.mode !== "everything") return false;
	try {
		await getDesktopAdapter(plugin.app).fs.promises.stat(result.absolutePath);
	} catch {
		new Notice(t("palette.error.pathGone"));
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
	});
	if (target.kind === "markdown") {
		await openExternalMarkdownInBackground(plugin, result.absolutePath);
		return true;
	}
	new Notice(t("palette.error.noBackgroundTab"));
	return false;
}

async function openExternalMarkdownInBackground(
	plugin: MyPalettePlugin,
	absolutePath: string,
): Promise<void> {
	// ネイティブの Markdown ビューも、裏で開くには別の対象が要る。そのため、
	// いまフォーカスを持っているノートを上書きすることは決してない。
	await plugin.openExternalMarkdown(absolutePath, "alternate", true, false);
}

async function openFileInBackground(plugin: MyPalettePlugin, file: TFile): Promise<void> {
	await openFileInLeaf(plugin.app, file, {
		action: "alternate",
		active: false,
		autoFocus: false,
		focusExisting: plugin.settings.focusExistingTab,
	});
}
