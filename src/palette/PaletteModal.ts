import { TFile, type App } from "obsidian";
import { isAbsolutePathUserIgnored, isUserIgnoredPath } from "../core/ignoredPaths";
import { isMarkdownPath } from "../core/externalFiles";
import { compactPath } from "../core/pathDisplay";
import type MyPalettePlugin from "../main";
import type { EverythingScope, PaletteMode, PaletteResult } from "../model/results";
import { SelectionModal, type SelectionItem } from "../ui/selectionModal";
import { parseInput } from "./inputParser";
import { runResultAction, type ActionKind } from "./resultActions";

export class PaletteModal extends SelectionModal<PaletteResult> {
	private generation = 0;
	private controller?: AbortController;
	private mode: PaletteMode = "file";
	private everythingScope: EverythingScope = "vault";

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
		initialInput = "",
		private readonly fixedMode?: Extract<
			PaletteMode,
			"link" | "backlink" | "bookmark" | "smart"
		>,
	) {
		super(
			{
				title: "Files",
				placeholder: "Search files · > commands · es Vault · esdir directory",
				initialInput,
				footerText: `Source: ${app.workspace.getActiveFile()?.path ?? "No active note"}`,
			},
			app,
		);
	}

	protected override onSelectionModalOpen(): void {
		// SelectionModal applies and refreshes the initial input.
		this.inputEl.addEventListener(
			"keydown",
			(event) => {
				const cursorIsAtEnd =
					this.inputEl.selectionStart === this.inputEl.value.length &&
					this.inputEl.selectionEnd === this.inputEl.value.length;
				if (event.key !== "ArrowRight" || event.isComposing || !cursorIsAtEnd) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				void this.openSelectedWithoutClosing();
			},
			true,
		);
	}

	protected override onSelectionModalClose(): void {
		this.generation += 1;
		this.controller?.abort();
		this.plugin.everythingClient.cancel();
	}

	protected override toSelectionItem(result: PaletteResult): SelectionItem {
		const isExternalMarkdown =
			result.mode === "everything" &&
			result.kind === "file" &&
			isMarkdownPath(result.absolutePath) &&
			(!result.vaultPath ||
				!(this.app.vault.getAbstractFileByPath(result.vaultPath) instanceof TFile));
		const everythingOpensInCode =
			result.mode === "everything" &&
			(isAbsolutePathUserIgnored(this.app, result.absolutePath) ||
				(Boolean(result.vaultPath) &&
					!(
						this.app.vault.getAbstractFileByPath(result.vaultPath ?? "") instanceof
						TFile
					)));
		const usesPath = result.mode === "file" || result.mode === "everything";
		return {
			label: result.primary,
			description: usesPath ? compactPath(result.secondary) : result.secondary,
			descriptionTitle: usesPath ? result.secondary : undefined,
			icon: result.icon,
			badge: isExternalMarkdown
				? this.plugin.settings.openExternalMarkdownInObsidian
					? "Obsidian"
					: "VS Code"
				: result.mode === "smart"
					? `${Math.round(result.score * 100)}%`
					: result.mode === "file" && isUserIgnoredPath(this.app, result.vaultPath)
						? "VS Code"
						: everythingOpensInCode
							? "VS Code"
							: result.mode === "everything" && result.kind === "folder"
								? "Folder"
								: undefined,
		};
	}

	protected override async onItemActivated(result: PaletteResult, event: Event): Promise<void> {
		const pointer = event as MouseEvent;
		const action: ActionKind =
			pointer.ctrlKey && pointer.shiftKey
				? "tertiary"
				: pointer.ctrlKey
					? "alternate"
					: "primary";
		await this.activatePaletteResult(action, result);
	}

	override async getSuggestions(input: string): Promise<PaletteResult[]> {
		this.controller?.abort();
		const generation = ++this.generation;
		const parsed = this.fixedMode
			? { mode: this.fixedMode, query: input }
			: parseInput(input, this.plugin.settings.prefixes);
		this.plugin.rememberPaletteQuery(parsed.mode, parsed.query);
		this.updateMatchQuery(parsed.query);
		this.mode = parsed.mode;
		this.everythingScope =
			("everythingScope" in parsed ? parsed.everythingScope : undefined) ?? "vault";
		this.updateMode();
		const delay = parsed.mode === "everything" ? this.plugin.settings.everything.debounceMs : 0;
		if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
		if (generation !== this.generation) return [];
		this.controller = new AbortController();
		try {
			const results = await this.plugin.providers[this.mode].search({
				mode: this.mode,
				query: parsed.query,
				signal: this.controller.signal,
				everythingScope: this.everythingScope,
			});
			if (generation !== this.generation) return [];
			this.updateResultCount(results.length);
			return results;
		} catch (error) {
			if (
				generation !== this.generation ||
				(error instanceof DOMException && error.name === "AbortError")
			)
				return [];
			this.emptyStateText = error instanceof Error ? error.message : String(error);
			this.updateResultCount(0);
			return [];
		}
	}

	private updateMode(): void {
		this.updatePlaceholder(
			this.mode === "link"
				? "Search links in the active file"
				: this.mode === "backlink"
					? "Search backlinks to the active file"
					: this.mode === "bookmark"
						? "Search bookmarks"
						: this.mode === "smart"
							? "Search Smart Connections"
							: "Search files · > commands · b bookmarks · sc Smart Connections · es everything",
		);
		this.modalEl.setAttribute("data-mode", this.mode);
		this.modalEl.setAttribute("data-everything-scope", this.everythingScope);
	}

	private async activatePaletteResult(
		action: ActionKind,
		result: PaletteResult,
		closePalette = true,
	): Promise<void> {
		if (!result) return;
		if (result.mode === "command") {
			if (action !== "primary") return;
			const exists = this.plugin.commandProvider
				.getCommands()
				.some(({ id }) => id === result.commandId);
			if (!exists) {
				this.refreshSuggestions();
				return;
			}
			this.plugin.recordCommand(result.commandId);
			this.close();
			(
				this.app.commands as unknown as { executeCommandById: (id: string) => boolean }
			).executeCommandById(result.commandId);
			return;
		}
		if (result.mode === "bookmark") {
			if (result.kind === "search" && result.query) {
				await this.app.workspace.openLinkText(result.query, "", true);
			} else if (result.file) {
				const leaf =
					action === "alternate"
						? this.app.workspace.getLeaf("tab")
						: action === "tertiary"
							? this.app.workspace.getLeaf("split", "vertical")
							: this.app.workspace.getLeaf(false);
				await leaf.openFile(result.file);
			}
			if (closePalette) this.close();
			return;
		}
		if (result.mode === "smart") {
			const leaf =
				action === "alternate"
					? this.app.workspace.getLeaf("tab")
					: action === "tertiary"
						? this.app.workspace.getLeaf("split", "vertical")
						: this.app.workspace.getLeaf(false);
			await leaf.openFile(result.file);
			if (closePalette) this.close();
			return;
		}
		if (result.mode === "link" || result.mode === "backlink") {
			const leaf =
				action === "alternate"
					? this.app.workspace.getLeaf("tab")
					: action === "tertiary"
						? this.app.workspace.getLeaf("split", "vertical")
						: this.app.workspace.getLeaf(false);
			await leaf.openFile(result.file);
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) editor.setCursor({ line: result.line, ch: 0 });
			if (closePalette) this.close();
			return;
		}
		const outcome = await runResultAction(this.app, result, action, {
			openExternalMarkdownInObsidian: this.plugin.settings.openExternalMarkdownInObsidian,
			openExternalMarkdown: (absolutePath, openAction) =>
				this.plugin.openExternalMarkdown(absolutePath, openAction, closePalette),
		});
		if (outcome.close) {
			if (closePalette) this.close();
			return;
		}
		this.emptyStateText = outcome.message ?? "The action failed.";
	}

	private async openSelectedWithoutClosing(): Promise<void> {
		const chooser = this as unknown as {
			chooser?: { values?: PaletteResult[]; selectedItem?: number };
		};
		const result = chooser.chooser?.values?.[chooser.chooser.selectedItem ?? -1];
		if (!result || result.mode === "command") return;
		const selectionStart = this.inputEl.selectionStart;
		const selectionEnd = this.inputEl.selectionEnd;
		await this.activatePaletteResult("primary", result, false);
		window.setTimeout(() => {
			if (!this.inputEl.isConnected) return;
			this.inputEl.focus({ preventScroll: true });
			this.inputEl.setSelectionRange(selectionStart, selectionEnd);
		});
	}
}
