import type { App } from "obsidian";
import { isAbsolutePathUserIgnored, isUserIgnoredPath } from "../core/ignoredPaths";
import type MyPalettePlugin from "../main";
import type { PaletteMode, PaletteResult } from "../model/results";
import { SelectionModal, type SelectionItem } from "../ui/selectionModal";
import { parseInput } from "./inputParser";
import { findAction } from "./keybindings";
import { runResultAction, type ActionKind } from "./resultActions";
import { statusText, type UiStatus } from "../ui/statusMessage";

export class PaletteModal extends SelectionModal<PaletteResult> {
	private generation = 0;
	private debounceTimer?: number;
	private controller?: AbortController;
	private status: UiStatus = "idle";
	private mode: PaletteMode = "file";
	private composing = false;

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
	) {
		super(
			{
				title: "Files",
				placeholder: "Search files · > commands · e / es Everything",
			},
			app,
		);
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-modal");
		this.modalEl.setAttrs({ role: "dialog", "aria-label": "My Palette" });
		this.inputEl.addEventListener("compositionstart", () => {
			this.composing = true;
		});
		this.inputEl.addEventListener("compositionend", () => {
			this.composing = false;
			this.scheduleSearch();
		});
		this.scheduleSearch();
	}

	protected override onSelectionModalClose(): void {
		this.generation += 1;
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.controller?.abort();
		this.plugin.everythingClient.cancel();
	}

	protected override onQueryChanged(): void {
		if (!this.composing) this.scheduleSearch();
	}

	protected override handleKeydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		const action = findAction(event, this.plugin.settings.keybindings);
		if (!action) {
			super.handleKeydown(event);
			return;
		}
		event.preventDefault();
		if (action === "close") {
			this.close();
			return;
		}
		if (action === "next" || action === "previous") {
			this.moveSelection(action === "next" ? 1 : -1);
			return;
		}
		void this.activatePaletteResult(
			action === "primary" ? "primary" : action === "alternate" ? "alternate" : "tertiary",
		);
	}

	protected override toSelectionItem(result: PaletteResult): SelectionItem {
		return {
			label: result.primary,
			description: result.secondary,
			icon: result.icon,
			badge:
				result.mode === "file" && isUserIgnoredPath(this.app, result.vaultPath)
					? "VS Code"
					: result.mode === "everything" &&
						  isAbsolutePathUserIgnored(this.app, result.absolutePath)
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

	private scheduleSearch(): void {
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.controller?.abort();
		const generation = ++this.generation;
		const parsed = parseInput(this.inputEl.value, this.plugin.settings.prefixes);
		this.mode = parsed.mode;
		this.updateMode();
		if (parsed.mode === "everything" && !parsed.query) {
			this.status = "idle";
			this.setItems([]);
			this.setStatus(statusText(this.status, 0, true));
			return;
		}
		const delay = parsed.mode === "everything" ? this.plugin.settings.everything.debounceMs : 0;
		this.debounceTimer = window.setTimeout(
			() => void this.search(parsed.query, generation),
			delay,
		);
	}

	private async search(query: string, generation: number): Promise<void> {
		this.controller = new AbortController();
		this.status = "loading";
		this.setLoading(true);
		this.setStatus(statusText(this.status, 0));
		try {
			const provider =
				this.mode === "file"
					? this.plugin.fileProvider
					: this.mode === "command"
						? this.plugin.commandProvider
						: this.plugin.everythingProvider;
			const results = await provider.search(query, this.controller.signal);
			if (generation !== this.generation) return;
			this.status = results.length ? "success" : "empty";
			this.setItems(results);
			this.setStatus(statusText(this.status, results.length));
		} catch (error) {
			if (
				generation !== this.generation ||
				(error instanceof DOMException && error.name === "AbortError")
			)
				return;
			this.status = "error";
			this.setItems([]);
			this.setStatus(error instanceof Error ? error.message : String(error));
			this.setActionButton(true, () => this.plugin.openSettings());
		} finally {
			if (generation === this.generation) this.setLoading(false);
		}
	}

	private updateMode(): void {
		const labels = { file: "Files", command: "Commands", everything: "Everything" };
		const icons = { file: "files", command: "terminal", everything: "search" };
		const placeholders = {
			file: "Search vault files",
			command: "Search Obsidian commands",
			everything: "Search Everything · e / es · native syntax supported",
		};
		this.setHeading(labels[this.mode], icons[this.mode]);
		this.inputEl.placeholder = placeholders[this.mode];
		this.modalEl.setAttribute("data-mode", this.mode);
		this.setActionButton(false);
	}

	private async activatePaletteResult(
		action: ActionKind,
		result = this.items[this.selectedIndex],
	): Promise<void> {
		if (!result) return;
		if (result.mode === "command") {
			if (action !== "primary") return;
			const exists = this.plugin.commandProvider
				.getCommands()
				.some(({ id }) => id === result.commandId);
			if (!exists) {
				this.scheduleSearch();
				this.setStatus("That command is no longer available.");
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
		else this.setStatus(outcome.message ?? "The action failed.");
	}
}
