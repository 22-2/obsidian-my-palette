import type { App, WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import { PaletteModal, type PaletteModalOptions } from "src/palette/PaletteModal";
import { shouldRestore, type PaletteRestoreState } from "src/palette/restoreState";
import { paletteModeAlias } from "src/palette/modes";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
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
	includeIgnored?: boolean;
	tableState?: PaletteTableState;
	viewType?: PaletteViewType;
}

/**
 * Opens the palette modal and persistent views. The modal palette keeps how it was
 * closed, so Open home can resume it within the Return to Home after time.
 */
export class PaletteOpener {
	private activeModal?: PaletteModal;
	private lastClosed?: { closedAt: number; state: PaletteRestoreState };
	/** Read for restore timing; tests replace it to move the clock. */
	now: () => number = () => Date.now();

	constructor(
		private readonly app: App,
		private readonly plugin: MyPalettePlugin,
	) {}

	openPalette(
		initialInput = "",
		fixedMode?: FixedPaletteMode,
		options: PaletteModalOptions = {},
	): void {
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
		const modal = new PaletteModal(this.app, this.plugin, initialInput, fixedMode, options);
		this.activeModal = modal;
		modal.open();
	}

	async openPaletteView(initialInput = "", fixedMode?: FixedPaletteMode): Promise<void> {
		await this.openSidebarPaletteView(PALETTE_VIEW_TYPE, initialInput, fixedMode);
	}

	async openPaletteTableView(initialInput = "", fixedMode?: FixedPaletteMode): Promise<void> {
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
			input = "",
			fixedMode,
			sourcePath,
			sourcePinned = false,
			includeIgnored = false,
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
				includeIgnored,
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

	/** Open home: resumes the palette closed recently enough, otherwise starts at Home. */
	openHomePalette(): void {
		const state = this.restorableState();
		this.openPalette(state?.input ?? "", undefined, { modeEntries: true, restore: state });
	}

	/** Called whenever a palette modal closes, so the next Open home can resume it. */
	rememberClosedPalette(state: PaletteRestoreState): void {
		this.lastClosed = { closedAt: this.now(), state };
	}

	private restorableState(): PaletteRestoreState | undefined {
		if (!this.lastClosed) return undefined;
		const { returnAfterSeconds } = this.plugin.settings.home;
		const restorable = shouldRestore(this.lastClosed.closedAt, this.now(), returnAfterSeconds);
		return restorable ? this.lastClosed.state : undefined;
	}

	/** The command list opens at its alias, with nothing typed after it. */
	commandPaletteInitialInput(): string {
		return `${paletteModeAlias("commands", this.plugin.settings.modes)} `;
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
