import { TFile, type App } from "obsidian";
import { emptyFileLabel } from "src/audit/noteEmptiness";
import { getVaultFullPath, isAbsolutePathUserIgnored } from "src/ignored-notes/ignoredPaths";
import { isMarkdownPath } from "src/shared/externalFiles";
import { compactPath } from "src/shared/pathDisplay";
import type { PaletteResult } from "src/palette/results";
import type { SelectionItem } from "src/ui/selectionModal";
import type { CopyablePaths } from "src/platform/pathClipboard";
import { t } from "src/i18n";

export interface PaletteResultPresentationOptions {
	openExternalMarkdownInObsidian: boolean;
}

const MAX_VISIBLE_MATCHED_METADATA = 3;

/** ファイルのセレクターが、検索の一致を説明するメタデータを同じ形で表示するよう共有する。 */
export function matchedMetadataPresentation(
	tags: readonly string[],
	keywords: readonly string[] = [],
): Pick<SelectionItem, "tags" | "tagsTitle"> {
	const metadata = [...tags, ...keywords];
	if (metadata.length === 0) return {};
	const visible = metadata.slice(0, MAX_VISIBLE_MATCHED_METADATA);
	if (metadata.length > MAX_VISIBLE_MATCHED_METADATA)
		visible.push(`+${metadata.length - MAX_VISIBLE_MATCHED_METADATA}`);
	const title =
		keywords.length > 0
			? [
					tags.length > 0 ? t("palette.matched.tags", { tags: tags.join(" ") }) : "",
					t("palette.matched.keywords", { keywords: keywords.join(", ") }),
				]
					.filter(Boolean)
					.join("\n")
			: tags.join(" ");
	return { tags: visible, tagsTitle: title };
}

/**
 * 検索結果の表示の方針をモーダルの外に置く。表示の書式を変えるたびに、検索のライフサイクルと
 * キーボードのイベント処理まで触らなくて済むようにするため。
 */
export function toPaletteSelectionItem(
	app: App,
	result: PaletteResult,
	options: PaletteResultPresentationOptions,
): SelectionItem {
	if (result.mode === "mode-entry") {
		return {
			label: result.primary,
			description: result.unavailable ? t("mode.unavailable") : result.secondary,
			icon: result.icon,
			badge: result.alias,
			disabled: result.unavailable,
		};
	}
	if (result.mode === "search-history") {
		return {
			label: result.primary,
			description: result.secondary,
			icon: result.icon,
		};
	}
	const isExternalMarkdown =
		result.mode === "everything" &&
		result.kind === "file" &&
		isMarkdownPath(result.absolutePath) &&
		(!result.vaultPath ||
			!(app.vault.getAbstractFileByPath(result.vaultPath) instanceof TFile));
	const ignoredMarkdownPath =
		result.mode === "file" && result.ignored
			? getVaultFullPath(app, result.vaultPath)
			: undefined;
	const isIgnoredMarkdown =
		typeof ignoredMarkdownPath === "string" && isMarkdownPath(ignoredMarkdownPath);
	const everythingOpensInCode =
		result.mode === "everything" &&
		(isAbsolutePathUserIgnored(app, result.absolutePath) ||
			(Boolean(result.vaultPath) &&
				!(app.vault.getAbstractFileByPath(result.vaultPath ?? "") instanceof TFile)));
	const usesPath = result.mode === "file" || result.mode === "everything";
	const matchedMetadata =
		result.mode === "file"
			? matchedMetadataPresentation(result.matchedTags ?? [], result.matchedKeywords ?? [])
			: {};
	return {
		label: result.primary,
		description: usesPath ? compactPath(result.secondary) : result.secondary,
		descriptionTitle: usesPath ? result.secondary : undefined,
		icon: result.icon,
		...matchedMetadata,
		badge:
			isExternalMarkdown || isIgnoredMarkdown
				? options.openExternalMarkdownInObsidian
					? // Why: ここで重要なのは、ファイルが Vault の外にあることであり、
						// どのネイティブのビューがそれを描画するかではない。
						t("palette.badge.outsideVault")
					: t("palette.badge.externalEditor")
				: result.mode === "smart"
					? `${Math.round(result.score * 100)}%`
					: result.mode === "file" && result.ignored
						? t("palette.badge.externalEditor")
						: everythingOpensInCode
							? t("palette.badge.externalEditor")
							: result.mode === "everything" && result.kind === "folder"
								? t("palette.badge.folder")
								: // Why: 名前の横の印は見えたままになる。パスの文字列は切り詰められる。
									result.mode === "audit" && result.kind === "empty-files"
									? emptyFileLabel(result.mocOnly)
									: result.mode === "heading"
										? `H${result.level}`
										: undefined,
	};
}

/**
 * パスのコピーの操作は、パレットのメニューとほかのファイルのセレクターで共有する。
 * そのためパスの選び方は、モーダルではなく表示の方針のそばに置く。
 */
export function getCopyablePaths(
	app: App,
	result: Exclude<PaletteResult, { mode: "command" | "search-history" | "mode-entry" }>,
): CopyablePaths {
	// Everything のフォルダーは移動できる結果だが、ファイルのパス操作を出すのはファイルの結果だけ。
	if (result.mode === "everything") {
		return result.kind === "file"
			? {
					fileName: fileNameOf(result.vaultPath ?? result.absolutePath),
					relativePath: result.vaultPath,
					absolutePath: result.absolutePath,
				}
			: {};
	}
	const file = "file" in result ? result.file : undefined;
	if (result.mode === "file")
		return {
			fileName: fileNameOf(result.vaultPath),
			relativePath: result.vaultPath,
			absolutePath: getVaultFullPath(app, result.vaultPath) ?? undefined,
		};
	if (result.mode === "plugin")
		return {
			fileName: fileNameOf(result.vaultPath),
			relativePath: result.vaultPath,
			absolutePath: result.absolutePath,
		};
	if (result.mode === "snippet")
		return {
			fileName: fileNameOf(result.vaultPath),
			relativePath: result.vaultPath,
			absolutePath: result.absolutePath,
		};
	if (result.mode === "audit" && result.kind === "empty-folders")
		return {
			fileName: fileNameOf(result.folderPath),
			relativePath: result.folderPath,
			absolutePath: getVaultFullPath(app, result.folderPath) ?? undefined,
		};
	if (!file) return {};
	return {
		fileName: fileNameOf(file.path),
		relativePath: file.path,
		absolutePath: getVaultFullPath(app, file.path) ?? undefined,
	};
}

export function isCopyablePaletteResult(
	result: PaletteResult,
): result is Exclude<PaletteResult, { mode: "command" | "search-history" | "mode-entry" }> {
	return (
		result.mode !== "command" &&
		result.mode !== "search-history" &&
		result.mode !== "mode-entry"
	);
}

function fileNameOf(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path;
}
