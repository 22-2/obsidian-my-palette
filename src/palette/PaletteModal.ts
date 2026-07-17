import { TFile, type App } from "obsidian";
import { isAbsolutePathUserIgnored, isUserIgnoredPath } from "../core/ignoredPaths";
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
		private readonly fixedMode?: Extract<PaletteMode, "link" | "backlink">,
	) {
		super(
			{
				title: "Files",
				placeholder: "Search files · > commands · es Vault · esdir directory",
				initialInput,
			},
			app,
		);
	}

	protected override onSelectionModalOpen(): void {
		// SelectionModal applies and refreshes the initial input.
		this.inputEl.addEventListener(
			"keydown",
			(event) => {
				if (event.key !== "ArrowRight" || event.isComposing) return;
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
		const everythingOpensInCode =
			result.mode === "everything" &&
			(isAbsolutePathUserIgnored(this.app, result.absolutePath) ||
				(Boolean(result.vaultPath) &&
					!(
						this.app.vault.getAbstractFileByPath(result.vaultPath ?? "") instanceof
						TFile
					)));
		return {
			label: result.primary,
			description: result.secondary,
			icon: result.icon,
			badge:
				result.mode === "file" && isUserIgnoredPath(this.app, result.vaultPath)
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
			const results =
				this.mode === "file"
					? await this.plugin.fileProvider.search(parsed.query)
					: this.mode === "command"
						? await this.plugin.commandProvider.search(parsed.query)
						: this.mode === "link" || this.mode === "backlink"
							? await this.plugin.relatedFileProvider.search(this.mode, parsed.query)
							: await this.plugin.everythingProvider.search(
									parsed.query,
									this.controller.signal,
									this.everythingScope,
								);
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
					: "Search files · > commands · es everything",
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
		const outcome = await runResultAction(this.app, result, action);
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
		await this.activatePaletteResult("primary", result, false);
	}
}
