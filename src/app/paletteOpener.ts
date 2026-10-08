import type { App, WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import { PaletteModal } from "src/palette/PaletteModal";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
import type { PaletteMode } from "src/palette/results";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import {
	PALETTE_TABLE_VIEW_TYPE,
	PALETTE_VIEW_TYPE,
	type PaletteViewType,
} from "src/palette/surfaces/paletteViewTypes";
import type { PaletteTableState } from "src/palette/table/paletteTableModel";

export interface NewPaletteViewOptions {
	input?: string;
	fixedMode?: FixedPaletteMode;
	sourcePath?: string;
	sourcePinned?: boolean;
	tableState?: PaletteTableState;
	viewType?: PaletteViewType;
}

/**
 * Opens the palette modal and persistent views, and remembers the last query
 * per mode so a reopened palette can resume where the user left off.
 */
export class PaletteOpener {
	private rememberedQueries: Partial<Record<PaletteMode, string>> = {};
	private activeModal?: PaletteModal;

	constructor(
		private readonly app: App,
		private readonly plugin: MyPalettePlugin,
	) {}

	openPalette(initialInput = "", fixedMode?: FixedPaletteMode): void {
		if (this.activeModal) {
			this.activeModal.focusSearchInput();
			return;
		}
		const existingInput = document.querySelector<HTMLInputElement>(
			".my-palette-suggest-modal .prompt-input",
		);
		if (existingInput) {
			existingInput.focus({ preventScroll: true });
			return;
		}
		const modal = new PaletteModal(this.app, this.plugin, initialInput, fixedMode);
		this.activeModal = modal;
		modal.open();
	}

	async openPaletteView(
		initialInput = this.getRememberedQuery("file"),
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		await this.openSidebarPaletteView(PALETTE_VIEW_TYPE, initialInput, fixedMode);
	}

	async openPaletteTableView(
		initialInput = this.getRememberedQuery("file"),
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		// Why: reuse a center table without overwriting its query. A new tab keeps
		// the current note intact and avoids reopening a restored sidebar table.
		const existing = this.app.workspace
			.getLeavesOfType(PALETTE_TABLE_VIEW_TYPE)
			.find((leaf) => leaf.getRoot() === this.app.workspace.rootSplit);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) {
			await leaf.setViewState({
				type: PALETTE_TABLE_VIEW_TYPE,
				active: true,
				state: this.viewState(initialInput, fixedMode),
			});
		}
		await this.app.workspace.revealLeaf(leaf);
		this.focusView(leaf);
	}

	async openNewPaletteView(options: NewPaletteViewOptions = {}): Promise<void> {
		const {
			input = this.getRememberedQuery("file"),
			fixedMode,
			sourcePath,
			sourcePinned = false,
			tableState,
			viewType = PALETTE_VIEW_TYPE,
		} = options;
		// Why: duplicating a table needs a fresh center tab, while list palettes
		// keep independent right-sidebar panes for simultaneous searches.
		const leaf =
			viewType === PALETTE_TABLE_VIEW_TYPE
				? this.app.workspace.getLeaf("tab")
				: this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: viewType,
			active: true,
			// A duplicated palette starts with the same presentation, then persists
			// its own sort state independently from the original pane.
			state: {
				...this.viewState(input, fixedMode, sourcePath, sourcePinned),
				...tableState,
			},
		});
		await this.app.workspace.revealLeaf(leaf);
		this.focusView(leaf);
	}

	releaseModal(modal: PaletteModal): void {
		if (this.activeModal === modal) this.activeModal = undefined;
	}

	closeModal(): void {
		this.activeModal?.close();
		this.activeModal = undefined;
	}

	rememberQuery(mode: PaletteMode, query: string, rawInput?: string): void {
		if (!this.plugin.settings.rememberLastInput) return;
		// なぜfileだけrawInputか: fileの再開入力はプレフィックス込みの生入力を
		// そのまま使うため(i fooなど)。commandは呼び出し側でプレフィックスを
		// 付与して復元するのでqueryのままにする。
		this.rememberedQueries[mode] = mode === "file" && rawInput !== undefined ? rawInput : query;
		if (mode === "everything" && rawInput !== undefined) this.rememberedQueries.file = rawInput;
	}

	getRememberedQuery(mode: PaletteMode): string {
		if (!this.plugin.settings.rememberLastInput) return "";
		return this.rememberedQueries[mode] ?? "";
	}

	clearRememberedQueries(): void {
		this.rememberedQueries = {};
	}

	commandPaletteInitialInput(): string {
		const prefix = this.plugin.settings.prefixes.command.trimEnd();
		return `${prefix} ${this.getRememberedQuery("command")}`;
	}

	private async openSidebarPaletteView(
		viewType: PaletteViewType,
		initialInput: string,
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		// Why: reuse only the requested view type, so opening a table cannot replace
		// the regular palette's query or its independently persisted sidebar pane.
		const hasRightSidebarPalette = this.app.workspace
			.getLeavesOfType(viewType)
			.some((leaf) => leaf.getRoot() === this.app.workspace.rightSplit);
		// Why: PaletteView.getState() is stored independently by Obsidian for each
		// leaf. Passing the plugin-wide remembered input every time would overwrite
		// that leaf's own query when the sidebar command is invoked again.
		const options = {
			active: true,
			reveal: true,
			...(hasRightSidebarPalette ? {} : { state: this.viewState(initialInput, fixedMode) }),
		};
		const leaf = await this.app.workspace.ensureSideLeaf(viewType, "right", options);
		this.focusView(leaf);
	}

	private viewState(
		input: string,
		fixedMode?: FixedPaletteMode,
		sourcePath?: string,
		sourcePinned = false,
	): {
		input: string;
		fixedMode?: FixedPaletteMode;
		sourcePath?: string;
		sourcePinned: boolean;
	} {
		return {
			input,
			fixedMode,
			sourcePath: sourcePinned ? sourcePath : undefined,
			sourcePinned,
		};
	}

	private focusView(leaf: WorkspaceLeaf): void {
		// Focus is explicit for command-created views; restored views must not steal
		// focus from the editor merely because Obsidian reopened their ItemView.
		if (leaf.view instanceof PaletteView) leaf.view.focusSearchInput();
	}
}
