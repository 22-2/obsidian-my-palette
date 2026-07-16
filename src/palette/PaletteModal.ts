import { Modal, setIcon, type App } from "obsidian";
import type MyPalettePlugin from "../main";
import type { PaletteMode, PaletteResult } from "../model/results";
import { parseInput } from "./inputParser";
import { findAction } from "./keybindings";
import { runResultAction, type ActionKind } from "./resultActions";
import { ResultList } from "../ui/ResultList";
import { statusText, type UiStatus } from "../ui/statusMessage";

export class PaletteModal extends Modal {
	private input!: HTMLInputElement;
	private modeIcon!: HTMLElement;
	private modeLabel!: HTMLElement;
	private spinner!: HTMLElement;
	private statusEl!: HTMLElement;
	private errorButton!: HTMLButtonElement;
	private list!: ResultList;
	private results: PaletteResult[] = [];
	private selectedIndex = 0;
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
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-modal");
		this.modalEl.setAttrs({ role: "dialog", "aria-label": "My Palette" });
		this.contentEl.empty();
		const header = this.contentEl.createDiv("my-palette-header");
		this.modeIcon = header.createSpan("my-palette-mode-icon");
		this.modeLabel = header.createSpan("my-palette-mode");
		this.input = header.createEl("input", {
			type: "text",
			cls: "my-palette-input",
			attr: {
				placeholder: "Search files, > commands, or e Everything",
				"aria-controls": "my-palette-results",
				autocomplete: "off",
				spellcheck: "false",
			},
		});
		this.spinner = header.createSpan("my-palette-spinner");
		this.spinner.setAttribute("aria-hidden", "true");
		const resultsEl = this.contentEl.createDiv("my-palette-results");
		this.list = new ResultList(resultsEl, (index, activate) => {
			this.selectedIndex = index;
			this.render();
			if (activate) void this.activate("primary");
		});
		const footer = this.contentEl.createDiv("my-palette-footer");
		this.statusEl = footer.createDiv("my-palette-status");
		this.errorButton = footer.createEl("button", {
			cls: "my-palette-settings-button",
			text: "Open settings",
		});
		this.errorButton.addEventListener("click", () => this.plugin.openSettings());
		footer.createDiv({ cls: "my-palette-hint", text: "Esc close" });
		this.input.addEventListener("compositionstart", () => {
			this.composing = true;
		});
		this.input.addEventListener("compositionend", () => {
			this.composing = false;
			this.scheduleSearch();
		});
		this.input.addEventListener("input", () => {
			if (!this.composing) this.scheduleSearch();
		});
		this.input.addEventListener("keydown", (event) => this.handleKeydown(event));
		window.setTimeout(() => this.input.focus(), 0);
		this.scheduleSearch();
	}

	onClose(): void {
		this.generation += 1;
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.controller?.abort();
		this.plugin.esClient.cancel();
		this.contentEl.empty();
	}

	private handleKeydown(event: KeyboardEvent): void {
		const action = findAction(event, this.plugin.settings.keybindings);
		if (!action) return;
		event.preventDefault();
		if (action === "close") {
			this.close();
			return;
		}
		if (action === "next" || action === "previous") {
			if (this.results.length)
				this.selectedIndex =
					(this.selectedIndex + (action === "next" ? 1 : -1) + this.results.length) %
					this.results.length;
			this.render();
			return;
		}
		void this.activate(
			action === "primary" ? "primary" : action === "alternate" ? "alternate" : "tertiary",
		);
	}

	private scheduleSearch(): void {
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.controller?.abort();
		const generation = ++this.generation;
		const parsed = parseInput(this.input.value, this.plugin.settings.prefixes);
		this.mode = parsed.mode;
		this.updateMode();
		if (parsed.mode === "everything" && !parsed.query) {
			this.results = [];
			this.selectedIndex = 0;
			this.status = "idle";
			this.render(true);
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
		if (this.mode === "everything") {
			this.status = "loading";
			this.render();
		}
		try {
			const provider =
				this.mode === "file"
					? this.plugin.fileProvider
					: this.mode === "command"
						? this.plugin.commandProvider
						: this.plugin.everythingProvider;
			const results = await provider.search(query, this.controller.signal);
			if (generation !== this.generation) return;
			this.results = results;
			this.selectedIndex = 0;
			this.status = results.length ? "success" : "empty";
			this.render();
		} catch (error) {
			if (
				generation !== this.generation ||
				(error instanceof DOMException && error.name === "AbortError")
			)
				return;
			this.results = [];
			this.status = "error";
			this.statusEl.setText(error instanceof Error ? error.message : String(error));
			this.render();
		}
	}

	private updateMode(): void {
		const labels = { file: "Files", command: "Commands", everything: "Everything" };
		const icons = { file: "files", command: "terminal", everything: "search" };
		this.modeLabel.setText(labels[this.mode]);
		setIcon(this.modeIcon, icons[this.mode]);
	}
	private render(everythingEmpty = false): void {
		const active = this.list.render(this.results, this.selectedIndex);
		if (active) this.input.setAttribute("aria-activedescendant", active);
		else this.input.removeAttribute("aria-activedescendant");
		this.spinner.toggleClass("is-visible", this.status === "loading");
		this.errorButton.toggleClass("is-visible", this.status === "error");
		if (this.status !== "error")
			this.statusEl.setText(statusText(this.status, this.results.length, everythingEmpty));
	}

	private async activate(action: ActionKind): Promise<void> {
		const result = this.results[this.selectedIndex];
		if (!result) return;
		if (result.mode === "command") {
			if (action !== "primary") return;
			const exists = this.plugin.commandProvider
				.getCommands()
				.some(({ id }) => id === result.commandId);
			if (!exists) {
				await this.search(
					parseInput(this.input.value, this.plugin.settings.prefixes).query,
					++this.generation,
				);
				this.statusEl.setText("That command is no longer available.");
				return;
			}
			this.close();
			this.plugin.recordCommand(result.commandId);
			(
				this.app.commands as unknown as { executeCommandById: (id: string) => boolean }
			).executeCommandById(result.commandId);
			return;
		}
		const outcome = await runResultAction(this.app, result, action);
		if (outcome.close) this.close();
		else {
			this.status = "error";
			this.statusEl.setText(outcome.message ?? "The action failed.");
			this.errorButton.removeClass("is-visible");
			if (result.mode === "file") {
				this.results.splice(this.selectedIndex, 1);
				this.selectedIndex = Math.min(
					this.selectedIndex,
					Math.max(0, this.results.length - 1),
				);
				this.list.render(this.results, this.selectedIndex);
			}
		}
	}
}
