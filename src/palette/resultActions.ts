import { Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { openFileInLeaf, type LeafOpenAction } from "src/workspace/openLeaf";
import { getVaultFullPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { openWithSystemApplication, showInSystemExplorer } from "src/platform/externalOpen";
import { resolveExternalOpenTarget, type ExternalOpenTarget } from "src/palette/openTargets";
import type { EverythingResult, PaletteResult } from "src/palette/results";
import { t } from "src/i18n";

export type ActionKind = LeafOpenAction;
export interface ActionOutcome {
	close: boolean;
	message?: string;
}

interface ExternalMarkdownActions {
	openExternalMarkdownInObsidian: boolean;
	openExternalMarkdown: (
		absolutePath: string,
		action: ActionKind,
		active?: boolean,
		targetLeaf?: WorkspaceLeaf,
	) => Promise<void>;
}

export interface ResultActionOptions {
	/** 常駐のパレットが主な開く操作に使う、既存の本文のリーフ。 */
	targetLeaf?: WorkspaceLeaf;
	/** 主な外部の操作、またはファイルを開く操作で、対象にフォーカスするかどうか。 */
	active?: boolean;
	/** プレビューの操作は、エディターにフォーカスせずに移動先を見せる。 */
	autoFocus?: boolean;
	/** ファイルをすでに表示しているタブを再利用する。既定は on。 */
	focusExistingTab?: boolean;
}

async function openExternalTarget(
	target: ExternalOpenTarget,
	action: ActionKind,
	externalMarkdown: ExternalMarkdownActions,
	active: boolean,
	targetLeaf?: WorkspaceLeaf,
): Promise<ActionOutcome> {
	if (target.kind === "markdown") {
		await externalMarkdown.openExternalMarkdown(
			target.absolutePath,
			action,
			active,
			targetLeaf,
		);
		return { close: true };
	}
	await openWithSystemApplication(target.absolutePath);
	return { close: true };
}

export async function runResultAction(
	app: App,
	result: PaletteResult,
	action: ActionKind,
	externalMarkdown: ExternalMarkdownActions,
	options: ResultActionOptions = {},
): Promise<ActionOutcome> {
	if (result.mode === "file") {
		const ignored = result.ignored || isUserIgnoredPath(app, result.vaultPath);
		if (ignored) {
			const absolutePath = getVaultFullPath(app, result.vaultPath);
			if (!absolutePath)
				return {
					close: false,
					message: t("palette.error.noAbsolutePath"),
				};
			try {
				await getDesktopAdapter(app).fs.promises.stat(absolutePath);
			} catch {
				return { close: false, message: t("palette.error.pathGone") };
			}
			// Obsidian の除外ファイルの結果は、中身を確認するための範囲。元のファイルには触れない。
			// 別のコピーと取り込みの流れは、MOC 挿入セレクターが担当する。
			const target = resolveExternalOpenTarget(absolutePath, {
				openMarkdownInObsidian: externalMarkdown.openExternalMarkdownInObsidian,
			});
			return await openExternalTarget(
				target,
				action,
				externalMarkdown,
				options.active ?? true,
				options.targetLeaf,
			);
		}
		const current = app.vault.getAbstractFileByPath(result.vaultPath);
		if (!(current instanceof TFile))
			return { close: false, message: t("palette.error.fileGone") };
		await openFile(app, current, action, options);
		return { close: true };
	}
	if (result.mode === "command") return { close: true };
	if (result.mode === "link" || result.mode === "backlink" || result.mode === "heading")
		return { close: false, message: t("palette.error.relatedOnly") };
	const everythingResult = result as EverythingResult;
	try {
		await getDesktopAdapter(app).fs.promises.stat(everythingResult.absolutePath);
	} catch {
		return { close: false, message: t("palette.error.pathGone") };
	}
	if (action === "alternate") {
		showInSystemExplorer(everythingResult.absolutePath, everythingResult.kind === "folder");
	} else if (everythingResult.vaultPath) {
		const current = app.vault.getAbstractFileByPath(everythingResult.vaultPath);
		if (current instanceof TFile) {
			await openFile(app, current, action, options);
			return { close: true };
		}
	}
	const target = resolveExternalOpenTarget(everythingResult.absolutePath, {
		openMarkdownInObsidian: externalMarkdown.openExternalMarkdownInObsidian,
	});
	return await openExternalTarget(
		target,
		action,
		externalMarkdown,
		options.active ?? true,
		options.targetLeaf,
	);
}

async function openFile(
	app: App,
	file: TFile,
	action: ActionKind,
	options: ResultActionOptions,
): Promise<void> {
	await openFileInLeaf(app, file, {
		action,
		targetLeaf: options.targetLeaf,
		active: options.active ?? true,
		autoFocus: options.autoFocus ?? true,
		focusExisting: options.focusExistingTab ?? true,
	});
}

export function notifyActionError(message: string): void {
	new Notice(message);
}
