import { TFile, type App } from "obsidian";
import { getVaultFullPath, isAbsolutePathUserIgnored } from "src/ignored-notes/ignoredPaths";
import { isMarkdownPath } from "src/shared/externalFiles";
import { compactPath } from "src/shared/pathDisplay";
import type { PaletteResult } from "src/model/results";
import type { SelectionItem } from "src/ui/selectionModal";
import type { CopyablePaths } from "src/platform/pathClipboard";

export interface PaletteResultPresentationOptions {
	openExternalMarkdownInObsidian: boolean;
}

const MAX_VISIBLE_MATCHED_TAGS = 3;

function matchedTagPresentation(
	tags: readonly string[],
): Pick<SelectionItem, "tags" | "tagsTitle"> {
	if (tags.length === 0) return {};
	const visibleTags = tags.slice(0, MAX_VISIBLE_MATCHED_TAGS);
	if (tags.length > MAX_VISIBLE_MATCHED_TAGS)
		visibleTags.push(`+${tags.length - MAX_VISIBLE_MATCHED_TAGS}`);
	return { tags: visibleTags, tagsTitle: tags.join(" ") };
}

/**
 * Keeps result display policy outside the modal so formatting changes do not
 * have to touch search lifecycle and keyboard event handling at the same time.
 */
export function toPaletteSelectionItem(
	app: App,
	result: PaletteResult,
	options: PaletteResultPresentationOptions,
): SelectionItem {
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
	const matchedTags =
		result.mode === "file" ? matchedTagPresentation(result.matchedTags ?? []) : {};
	return {
		label: result.primary,
		description: usesPath ? compactPath(result.secondary) : result.secondary,
		descriptionTitle: usesPath ? result.secondary : undefined,
		icon: result.icon,
		...matchedTags,
		badge:
			isExternalMarkdown || isIgnoredMarkdown
				? options.openExternalMarkdownInObsidian
					? "ReadOnly"
					: "VS Code"
				: result.mode === "smart"
					? `${Math.round(result.score * 100)}%`
					: result.mode === "file" && result.ignored
						? "VS Code"
						: everythingOpensInCode
							? "VS Code"
							: result.mode === "everything" && result.kind === "folder"
								? "Folder"
								: undefined,
	};
}

/**
 * Path-copy actions are shared by palette menus and other file selectors, so
 * their path selection belongs beside the presentation policy, not the modal.
 */
export function getCopyablePaths(
	app: App,
	result: Exclude<PaletteResult, { mode: "command" | "search-history" }>,
): CopyablePaths {
	// Everything folders are navigable results, but only file results should expose file-path actions.
	if (result.mode === "everything") {
		return result.kind === "file"
			? { relativePath: result.vaultPath, absolutePath: result.absolutePath }
			: {};
	}
	const file = "file" in result ? result.file : undefined;
	if (result.mode === "file")
		return {
			relativePath: result.vaultPath,
			absolutePath: getVaultFullPath(app, result.vaultPath) ?? undefined,
		};
	if (!file) return {};
	return {
		relativePath: file.path,
		absolutePath: getVaultFullPath(app, file.path) ?? undefined,
	};
}
