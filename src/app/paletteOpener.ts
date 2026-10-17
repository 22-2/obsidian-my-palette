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
 * パレットのモーダルと常駐ビューを開く。モーダルのパレットは閉じ方を覚えているので、
 * 「ホームを開く」は Home に戻るまでの時間内なら前の状態から再開できる。
 */
export class PaletteOpener {
	private activeModal?: PaletteModal;
	private lastClosed?: { closedAt: number; state: PaletteRestoreState };
	/** 復元の時間の判定に使う。テストでは差し替えて時計を進める。 */
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
		// Why: 中央の表は、クエリを上書きせず再利用する。新しいタブにすると、
		// 現在のノートをそのまま残し、復元されたサイドバーの表を開き直さずに済む。
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
		// Why: 表の複製には新しい中央のタブが要る。一覧のパレットは、同時に検索できるよう
		// 右サイドバーのペインをそれぞれ独立に持つ。
		const leaf =
			viewType === PALETTE_TABLE_VIEW_TYPE
				? this.app.workspace.getLeaf("tab")
				: this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: viewType,
			active: true,
			// 複製したパレットは同じ表示で始まり、その後の並び順は元のペインとは
			// 独立に保存する。
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

	/** ホームを開く: 最近閉じたパレットなら再開し、そうでなければ Home から始める。 */
	openHomePalette(): void {
		const state = this.restorableState();
		this.openPalette(state?.input ?? "", undefined, { modeEntries: true, restore: state });
	}

	/** パレットのモーダルを閉じるたびに呼ぶ。次の「ホームを開く」で再開できるようにするため。 */
	rememberClosedPalette(state: PaletteRestoreState): void {
		this.lastClosed = { closedAt: this.now(), state };
	}

	private restorableState(): PaletteRestoreState | undefined {
		if (!this.lastClosed) return undefined;
		const { returnAfterSeconds } = this.plugin.settings.home;
		const restorable = shouldRestore(this.lastClosed.closedAt, this.now(), returnAfterSeconds);
		return restorable ? this.lastClosed.state : undefined;
	}

	/**
	 * Vault 監査は列が多いので、表のパレットで開く。すでにそれを表示している表は前面に出し、
	 * ほかの表はそれぞれのクエリを保つ。
	 */
	async openAuditTable(): Promise<void> {
		const input = `${paletteModeAlias("audit", this.plugin.settings.modes)} `;
		const existing = this.app.workspace
			.getLeavesOfType(PALETTE_TABLE_VIEW_TYPE)
			.find((leaf) => {
				const state = leaf.view instanceof PaletteView ? leaf.view.getState() : undefined;
				return typeof state?.input === "string" && state.input.startsWith(input);
			});
		if (!existing) {
			await this.openNewPaletteView({ input, viewType: PALETTE_TABLE_VIEW_TYPE });
			return;
		}
		await this.app.workspace.revealLeaf(existing);
		this.focusView(existing);
	}

	/** コマンド一覧は、そのエイリアスだけを入力した状態で開く。 */
	commandPaletteInitialInput(): string {
		return `${paletteModeAlias("commands", this.plugin.settings.modes)} `;
	}

	private async openSidebarPaletteView(
		viewType: PaletteViewType,
		initialInput: string,
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		// Why: 要求されたビューの種類だけを再利用する。表を開いたときに、通常のパレットの
		// クエリや、独立に保存されたサイドバーのペインを置き換えないようにするため。
		const hasRightSidebarPalette = this.app.workspace
			.getLeavesOfType(viewType)
			.some((leaf) => leaf.getRoot() === this.app.workspace.rightSplit);
		// Why: PaletteView.getState() は Obsidian がリーフごとに独立して保存する。
		// プラグイン全体で覚えた入力を毎回渡すと、サイドバーのコマンドを再実行したときに
		// そのリーフ自身のクエリを上書きしてしまうため。
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
		// コマンドが作ったビューはフォーカスを明示的に移す。復元されたビューは、Obsidian が
		// ItemView を開き直しただけでエディターからフォーカスを奪ってはいけない。
		if (leaf.view instanceof PaletteView) leaf.view.focusSearchInput();
	}
}
