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
	private composing = false;

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
	) {
		super(
			{
				title: "Files",
				placeholder: "Search files · > commands · es Vault · esdir directory",
			},
			app,
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
		const parsed = parseInput(input, this.plugin.settings.prefixes);
		this.mode = parsed.mode;
		this.everythingScope = parsed.everythingScope ?? "vault";
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
						: await this.plugin.everythingProvider.search(
								parsed.query,
								this.controller.signal,
								this.everythingScope,
							);
			return generation === this.generation ? results : [];
		} catch (error) {
			if (
				generation !== this.generation ||
				(error instanceof DOMException && error.name === "AbortError")
			)
				return [];
			this.emptyStateText = error instanceof Error ? error.message : String(error);
			return [];
		}
	}

	private updateMode(): void {
		const placeholders = {
			file: "Search vault files",
			command: "Search Obsidian commands",
			everything:
				this.everythingScope === "vault"
					? "Search indexed Vault files · es"
					: "Search every file under the Vault directory · esdir",
		};
		this.updatePlaceholder(placeholders[this.mode]);
		this.modalEl.setAttribute("data-mode", this.mode);
		this.modalEl.setAttribute("data-everything-scope", this.everythingScope);
	}

	private async activatePaletteResult(action: ActionKind, result: PaletteResult): Promise<void> {
		if (!result) return;
		if (result.mode === "command") {
			if (action !== "primary") return;
			const exists = this.plugin.commandProvider
				.getCommands()
				.some(({ id }) => id === result.commandId);
			if (!exists) {
				this.inputEl.dispatchEvent(new Event("input"));
				return;
			}
			this.plugin.recordCommand(result.commandId);
			this.close();
			(
				this.app.commands as unknown as { executeCommandById: (id: string) => boolean }
			).executeCommandById(result.commandId);
			return;
		}
		const outcome = await runResultAction(this.app, result, action);
		if (outcome.close) this.close();
		else this.emptyStateText = outcome.message ?? "The action failed.";
	}
}
