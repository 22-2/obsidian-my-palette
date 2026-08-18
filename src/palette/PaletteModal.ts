import { Menu, Notice, setIcon, TFile, type App } from "obsidian";
import { isAbsolutePathUserIgnored, isUserIgnoredPath } from "src/core/ignoredPaths";
import { getDesktopAdapter } from "src/core/desktopAdapter";
import { isMarkdownPath } from "src/core/externalFiles";
import { compactPath } from "src/core/pathDisplay";
import type MyPalettePlugin from "src/main";
import type { EverythingScope, PaletteMode, PaletteResult } from "src/model/results";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";
import { runResultAction, type ActionKind } from "src/palette/resultActions";

export class PaletteModal extends SelectionModal<PaletteResult> {
	private generation = 0;
	private controller?: AbortController;
	private historyDelayTimer?: number;
	private suppressHistoryForNextInput = false;
	private skipInitialHistoryRecord: boolean;
	private activeMenu?: Menu;
	private historySuggest?: SearchHistorySuggest;
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
		this.skipInitialHistoryRecord = Boolean(initialInput);
	}

	protected override onSelectionModalOpen(): void {
		// SelectionModal applies and refreshes the initial input.
		this.addSearchHistoryButton();
		this.historySuggest = new SearchHistorySuggest(
			this.inputEl.parentElement ?? this.modalEl,
			(result) => this.applySearchHistory(result),
		);
		this.plugin.registerDomEvent(this.inputEl, "input", () => {
			const history = this.getSearchHistoryContext(this.inputEl.value);
			this.historySuggest?.update(
				this.plugin.getSearchHistorySuggestions(history.query, history.category),
			);
		});
		this.plugin.registerDomEvent(
			this.inputEl,
			"keydown",
			(event) => {
				if (
					event.ctrlKey &&
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					event.key.toLocaleLowerCase() === "r"
				) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.showSearchHistorySuggest();
					return;
				}
				if (!this.historySuggest?.isOpen) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					if (!this.historySuggest.moveSelection(event.key === "ArrowDown" ? 1 : -1))
						return;
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (event.key !== "Enter" || !this.historySuggest.selectCurrent()) return;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			true,
		);
		this.plugin.registerDomEvent(
			window,
			"keydown",
			(event) => {
				if (
					event.key !== "Escape" ||
					this.historySuggest?.isOpen !== true ||
					!(event.target instanceof Node) ||
					!this.modalEl.contains(event.target)
				)
					return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.historySuggest.close();
			},
			true,
		);
		this.plugin.registerDomEvent(document, "mousedown", (event) => {
			const target = event.target;
			if (
				!(target instanceof Node) ||
				this.historySuggest?.isOpen !== true ||
				this.historySuggest?.contains(target) ||
				target === this.inputEl
			)
				return;
			this.historySuggest.close();
		});
		this.plugin.registerDomEvent(
			this.inputEl,
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
		this.plugin.registerDomEvent(
			this.inputEl,
			"keydown",
			(event) => {
				if (event.key === "Enter" && !event.isComposing && !this.hasSelectedResult()) {
					this.recordCurrentSearch();
				}
			},
			true,
		);
	}

	protected override onSelectionModalClose(): void {
		this.plugin.releasePaletteModal(this);
		this.generation += 1;
		this.controller?.abort();
		this.cancelHistoryDelay();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historySuggest?.destroy();
		this.historySuggest = undefined;
		this.plugin.everythingClient.cancel();
	}

	protected override getInitialInputSelectionRange(): [number, number] {
		const commandPrefix = `${this.plugin.settings.prefixes.command.trimEnd()} `;
		return this.inputEl.value.toLocaleLowerCase().startsWith(commandPrefix.toLocaleLowerCase())
			? [commandPrefix.length, this.inputEl.value.length]
			: [0, this.inputEl.value.length];
	}

	protected override toSelectionItem(result: PaletteResult): SelectionItem {
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
					? "ReadOnly"
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

	protected override async onItemActivated(result: PaletteResult, _event: Event): Promise<void> {
		await this.activatePaletteResult("primary", result);
	}

	protected override async onSuggestionMiddleClick(result: PaletteResult): Promise<void> {
		if (result.mode === "search-history") {
			this.applySearchHistory(result);
			return;
		}
		const activeLeaf = this.app.workspace.activeLeaf;
		try {
			await this.openResultInBackground(result);
		} finally {
			if (activeLeaf && this.app.workspace.activeLeaf !== activeLeaf)
				this.app.workspace.setActiveLeaf(activeLeaf, { focus: false });
			this.inputEl.focus({ preventScroll: true });
		}
	}

	protected override handlesSuggestionMiddleClick(): boolean {
		return true;
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override registerSelectionDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void {
		this.plugin.registerDomEvent(el, type, callback, options);
	}

	protected override onSuggestionContextMenu(result: PaletteResult, event: MouseEvent): void {
		this.selected = result;
		const menu = this.replaceActiveMenu(new Menu());
		if (result.mode === "search-history") {
			menu.addItem((item) =>
				item
					.setTitle("Use search")
					.setIcon("history")
					.onClick(() => this.applySearchHistory(result)),
			);
		} else if (result.mode === "command") {
			menu.addItem((item) =>
				item
					.setTitle("Run command")
					.setIcon("play")
					.onClick(() => void this.activatePaletteResult("primary", result)),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("Open")
					.setIcon("external-link")
					.onClick(() => void this.activatePaletteResult("primary", result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in new tab (background)")
					.setIcon("panel-top-open")
					.onClick(() => void this.openResultInBackground(result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in horizontal split")
					.setIcon("separator-horizontal")
					.onClick(() => void this.activatePaletteResult("horizontal", result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in vertical split")
					.setIcon("separator-vertical")
					.onClick(() => void this.activatePaletteResult("vertical", result)),
			);
			if (result.mode === "everything") {
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle("Show in file explorer")
						.setIcon("folder-open")
						.onClick(() => void this.activatePaletteResult("alternate", result)),
				);
			}
		}
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	override async getSuggestions(input: string): Promise<PaletteResult[]> {
		const suppressHistoryRecord = this.suppressHistoryForNextInput;
		this.suppressHistoryForNextInput = false;
		this.cancelHistoryDelay();
		this.controller?.abort();
		const generation = ++this.generation;
		const parsed = this.fixedMode
			? { mode: this.fixedMode, query: input }
			: parseInput(input, this.plugin.settings.prefixes);
		if (this.initialInputReady)
			this.plugin.rememberPaletteQuery(parsed.mode, parsed.query, input);
		this.updateMatchQuery(parsed.query);
		this.mode = parsed.mode;
		this.everythingScope =
			("everythingScope" in parsed ? parsed.everythingScope : undefined) ?? "vault";
		this.updateMode();
		if (this.skipInitialHistoryRecord) {
			this.skipInitialHistoryRecord = false;
		} else if (!suppressHistoryRecord) {
			this.scheduleSearchHistory(input);
		}
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
		if (result.mode === "search-history") {
			this.applySearchHistory(result);
			return;
		}
		this.recordCurrentSearch();
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
			window.queueMicrotask(() => {
				(
					this.app.commands as unknown as { executeCommandById: (id: string) => boolean }
				).executeCommandById(result.commandId);
			});
			return;
		}
		if (result.mode === "bookmark") {
			if (result.kind === "search" && result.query) {
				await this.app.workspace.openLinkText(result.query, "", true);
			} else if (result.file) {
				const leaf =
					action === "alternate"
						? this.app.workspace.getLeaf("tab")
						: action === "horizontal"
							? this.app.workspace.getLeaf("split", "horizontal")
							: action === "vertical"
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
					: action === "horizontal"
						? this.app.workspace.getLeaf("split", "horizontal")
						: action === "vertical"
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
					: action === "horizontal"
						? this.app.workspace.getLeaf("split", "horizontal")
						: action === "vertical"
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

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		this.historySuggest?.close();
		this.suppressHistoryForNextInput = true;
		this.inputEl.value = this.plugin.formatSearchHistoryInput(result);
		this.refreshSuggestions();
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private addSearchHistoryButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-history-button",
			attr: {
				type: "button",
				"aria-label": "Search history",
				"aria-keyshortcuts": "Control+R",
				title: "Search history (Ctrl+R)",
			},
		});
		setIcon(button, "chevron-down");
		this.plugin.registerDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.plugin.registerDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.showSearchHistorySuggest();
		});
	}

	private showSearchHistorySuggest(): void {
		const history = this.getSearchHistoryContext(this.inputEl.value);
		this.historySuggest?.show(
			this.plugin.getSearchHistorySuggestions(history.query, history.category),
		);
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private replaceActiveMenu(menu: Menu): Menu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private async openResultInBackground(result: PaletteResult): Promise<void> {
		if (result.mode === "command") return;
		if (result.mode === "bookmark") {
			if (result.kind === "search" && result.query) {
				await this.app.workspace.openLinkText(result.query, "", "tab", { active: false });
				return;
			}
			if (result.file) await this.openFileInBackground(result.file);
			return;
		}
		if (result.mode === "file") {
			if (isUserIgnoredPath(this.app, result.vaultPath)) {
				new Notice("Ignored files cannot be opened in a background Obsidian tab.");
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(result.vaultPath);
			if (file instanceof TFile) await this.openFileInBackground(file);
			else new Notice("The file no longer exists.");
			return;
		}
		if (result.mode === "link" || result.mode === "backlink" || result.mode === "smart") {
			await this.openFileInBackground(result.file);
			return;
		}
		if (result.mode !== "everything") return;
		try {
			await getDesktopAdapter(this.app).fs.promises.stat(result.absolutePath);
		} catch {
			new Notice("The selected path no longer exists.");
			return;
		}
		if (result.vaultPath) {
			const file = this.app.vault.getAbstractFileByPath(result.vaultPath);
			if (file instanceof TFile) {
				await this.openFileInBackground(file);
				return;
			}
		}
		if (
			isMarkdownPath(result.absolutePath) &&
			this.plugin.settings.openExternalMarkdownInObsidian
		) {
			await this.plugin.openExternalMarkdown(result.absolutePath, "primary", true, false);
			return;
		}
		new Notice("This item cannot be opened in a background Obsidian tab.");
	}

	private async openFileInBackground(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf("tab").openFile(file, { active: false });
	}

	private recordCurrentSearch(): void {
		this.cancelHistoryDelay();
		const search = this.recordableSearch(this.inputEl.value);
		if (search) this.plugin.recordSearch(search.query, search.category);
	}

	private scheduleSearchHistory(input: string): void {
		const history = this.plugin.settings.searchHistory;
		const search = this.recordableSearch(input);
		if (!history.enabled || !search || history.addDelayMs <= 0) return;
		this.historyDelayTimer = window.setTimeout(() => {
			this.historyDelayTimer = undefined;
			if (search) this.plugin.recordSearch(search.query, search.category);
		}, history.addDelayMs);
	}

	private getSearchHistoryContext(input: string): {
		query: string;
		category: ReturnType<typeof getSearchHistoryCategory>;
	} {
		const parsed = this.fixedMode
			? { mode: this.fixedMode, query: input }
			: parseInput(input, this.plugin.settings.prefixes);
		return {
			query: parsed.query,
			category: getSearchHistoryCategory(parsed),
		};
	}

	private recordableSearch(
		input: string,
	): { query: string; category: ReturnType<typeof getSearchHistoryCategory> } | undefined {
		const search = this.getSearchHistoryContext(input);
		return search.query.trim() ? search : undefined;
	}

	private cancelHistoryDelay(): void {
		if (this.historyDelayTimer === undefined) return;
		window.clearTimeout(this.historyDelayTimer);
		this.historyDelayTimer = undefined;
	}

	private hasSelectedResult(): boolean {
		const chooser = this as unknown as {
			chooser?: { values?: PaletteResult[]; selectedItem?: number };
		};
		return Boolean(chooser.chooser?.values?.[chooser.chooser.selectedItem ?? -1]);
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
