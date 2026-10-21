import { Notice, setIcon, type App } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import {
	renderSelectionItem,
	type SelectionHighlightOptions,
	type SelectionItem,
} from "src/ui/selectionModal";
import type { SelectorControls } from "src/ui/selectorControls";
import {
	changeCount,
	directChanges,
	isCheckedRow,
	pendingChanges,
	type MultiSelectChanges,
} from "src/ui/multiSelectChanges";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** 1つの選択できる行。`value` は、行がチェックされたときにモーダルが返す値。 */
export interface MultiSelectCandidate<V> {
	/** 安定した識別子。一覧はクエリごとに絞り直されるので、チェックはキーで保持する。 */
	key: string;
	value: V;
	/** 行の内容。チェックのアイコンはモーダルが付ける。 */
	item: SelectionItem;
	/**
	 * すでにすべての対象に適用されている(全対象が持つタグ、双方向にリンクされたノート)。
	 * このような行は最初からチェックされ、チェックを外すと削除される。
	 */
	applied?: boolean;
	/** チェックされていない行のアイコン。既定は空の四角。 */
	uncheckedIcon?: string;
	/**
	 * 行が適用する内容を取り消す。すでに全部または一部が適用されている行の右クリックメニューに出す。
	 * ホストは `run` で自分のデータを更新し、その後で一覧を描き直す。
	 */
	removal?: { label: string; run: () => void | Promise<void> };
}

export interface MultiSelectModalProps {
	placeholder: string;
	/** このセレクターのヘルプに出す、対象の文脈。 */
	contextLabel: string;
	/** 実行の操作と Ctrl+Enter の案内に使う動詞。例: 「追加」。 */
	actionLabel: string;
	controls: SelectorControls;
}

/** 実行のメニューの名前。追加だけなら、なじみのある「2 件を今すぐ追加」の言い方を保つ。 */
function runTitle<V>(
	changes: MultiSelectChanges<V>,
	actionLabel: string,
	state: "now" | "checked",
): string {
	if (changes.remove.length > 0) return t("multi.runChanges", { count: changeCount(changes) });
	return state === "now"
		? t("multi.runNow", { action: actionLabel, count: changes.add.length })
		: t("multi.runChecked", { action: actionLabel, count: changes.add.length });
}

/** 保留中の変更の表示。「+2 −1」のように。 */
function summarizeChanges<V>(changes: MultiSelectChanges<V>): string {
	const parts: string[] = [];
	if (changes.add.length > 0) parts.push(`+${changes.add.length}`);
	if (changes.remove.length > 0) parts.push(`−${changes.remove.length}`);
	return parts.join(" ");
}

/**
 * タグ挿入、MOC 挿入、MOC 削除のセレクターが共有する複数選択。動きと見た目をそろえるため。
 * 流れ: 1行を実行する(Enter)、または行を選ぶ・チェックする(クリック、Ctrl、Shift、矢印、
 * スペース、チェックボックス、右クリックメニュー) → Ctrl+Enter かチェック済みのボタンで実行する。
 * チェックするとモーダルは開いたままになる。それ以外で閉じると取り消しになる。
 */
export abstract class MultiSelectModal<V> extends BaseSuggestModal<MultiSelectCandidate<V>> {
	/** 最初の状態から変わったチェックの行。これが保留中の変更になる。 */
	private readonly toggled = new Map<string, MultiSelectCandidate<V>>();
	private confirmedChanges?: MultiSelectChanges<V>;
	private resolveResult?: (changes: MultiSelectChanges<V> | null) => void;
	private activeMenu?: PaletteMenu;
	private checkedButtonEl?: HTMLElement;
	private checkedCountEl?: HTMLElement;
	private readonly candidateLimit = this.limit;
	/** 最後に並んでいた順のキー。チェックが変わっても、行が飛ばないように保つ。 */
	private listedOrder: string[] = [];
	private keepListedOrder = false;

	constructor(
		private readonly multiSelect: MultiSelectModalProps,
		app: App,
	) {
		super(
			{
				placeholder: multiSelect.placeholder,
				controls: { ...multiSelect.controls, context: multiSelect.contextLabel },
				// パレットと同じエクスプローラー風の選択: クリック、Ctrl、Shift で行を選び、チェックしてから操作を実行する。
				selectionMode: "extended",
				// Why: ここではスペースでチェックし、f で入力に戻る。単独のキーが検索語に入らないように、
				// それを守る選択モードが要る。パレットにはそのコマンドがなく、モードは off のままなので、
				// Enter で先頭の行がすぐ実行される。
				interactionModes: true,
			},
			app,
		);
	}

	/** 入力に対する候補。一致の良いものが先。 */
	protected abstract searchCandidates(
		query: string,
	): MultiSelectCandidate<V>[] | Promise<MultiSelectCandidate<V>[]>;

	/** 行で強調する文字列。ホストは一致の周りにユーザーが打った構文を取り除く。 */
	protected matchQuery(query: string): string {
		return query;
	}

	/** ホストが、選んだ行に対する開く・コピーなどの操作を独自に加えられる。 */
	protected populateSelectionMenu(
		_menu: PaletteMenu,
		_selected: readonly MultiSelectCandidate<V>[],
		_close: () => void,
	): void {}

	/** 保留中の変更がある行。ホストが一覧を組み直している間も、一覧に残す。 */
	private pendingCandidates(): MultiSelectCandidate<V>[] {
		return [...this.toggled.values()];
	}

	/**
	 * モーダルを開き、追加する行と、削除する適用済みの行を返す。キャンセルすると null。
	 * 一部の行がすでに適用されているときに使う。
	 */
	openAndWaitChanges(): Promise<MultiSelectChanges<V> | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	/** 追加する行を返す。行がすでに適用されていることがないセレクター向け。 */
	async openAndWait(): Promise<V[] | null> {
		return (await this.openAndWaitChanges())?.add ?? null;
	}

	async getSuggestions(query: string): Promise<MultiSelectCandidate<V>[]> {
		this.updateMatchQuery(this.matchQuery(query));
		const found = await this.searchCandidates(query);
		const foundByKey = new Map(found.map((candidate) => [candidate.key, candidate]));
		// 保留中の変更は、ホストがもう返さなくなっても、クエリをまたいで見えたままにする。
		const pending = this.pendingCandidates().map(
			(candidate) => foundByKey.get(candidate.key) ?? candidate,
		);
		// 固定された行が、次の未チェックの候補の場所を奪わないようにする。
		this.limit = this.candidateLimit + pending.length;
		const rest = found.filter(({ key }) => !this.toggled.has(key));
		// 安定したグループ: 変更した行が先、次に追加する行、最後に適用済みの行。
		const grouped = [
			...pending,
			...rest.filter(({ applied }) => !applied),
			...rest.filter(({ applied }) => applied),
		];
		const candidates = this.keepListedOrder ? this.inListedOrder(grouped) : grouped;
		this.keepListedOrder = false;
		this.listedOrder = candidates.map(({ key }) => key);
		this.updateResultCount(candidates.length);
		return candidates;
	}

	/**
	 * Why: 行をチェックすると、その行は先頭に固定され、カーソルも一緒に動いてしまう。行は次の検索まで
	 * 場所を保つ。限度がチェックのたびに増えて初めて表示される行は、それらの後に並ぶ。
	 */
	private inListedOrder(
		candidates: readonly MultiSelectCandidate<V>[],
	): MultiSelectCandidate<V>[] {
		const rank = new Map(this.listedOrder.map((key, index) => [key, index]));
		const rankOf = ({ key }: MultiSelectCandidate<V>) => rank.get(key) ?? rank.size;
		return [...candidates].sort((a, b) => rankOf(a) - rankOf(b));
	}

	renderSuggestion(candidate: MultiSelectCandidate<V>, el: HTMLElement): void {
		const checked = this.isChecked(candidate);
		renderSelectionItem(
			this.toSelectionItem(candidate),
			el,
			this.query,
			this.highlightOptions(),
		);
		// 行はその場で描き直されることがあるので、クラスは両方向に設定する。
		el.classList.toggle("is-applied", Boolean(candidate.applied));
		el.classList.toggle("is-pending-removal", Boolean(candidate.applied) && !checked);
		el.classList.toggle("is-checked", checked);
		el.setAttribute("aria-checked", String(checked));
		// チェックのアイコンは、キーボードのモードとは別に、1回の押下でその行をチェックする。
		// そのためポインターのユーザーも、チェックした一覧を作れる。
		el.querySelector(".my-palette-suggestion__icon")?.setAttribute("data-row-toggle", "");
	}

	/** 行の強調の設定。検索と同じ「かな無視」の設定を使い、絞り込みと強調がずれないようにする。 */
	private highlightOptions(): SelectionHighlightOptions {
		return { foldKana: this.multiSelect.controls.plugin.settings.file.foldKana };
	}

	private isChecked(candidate: MultiSelectCandidate<V>): boolean {
		return isCheckedRow(candidate, this.toggledKeys());
	}

	private toggledKeys(): ReadonlySet<string> {
		return new Set(this.toggled.keys());
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override populateSelectorActions(menu: PaletteMenu): void {
		const targets = this.getSelectedItems();
		this.populateSelectionMenu(menu, targets, () => this.close());
		this.addCheckMenuItems(menu, targets);
		this.addRemovalMenuItem(menu, targets);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.clearChanges)
				.setDisabled(this.toggled.size === 0)
				.onClick(() => this.clearPendingChanges()),
		);
	}

	protected override onSuggestionContextMenu(
		candidate: MultiSelectCandidate<V>,
		event: MouseEvent,
	): void {
		// パネルは、行が選択の内側になければクリックした行へ選択を動かしているので、
		// メニューはパレット自身のメニューと同じく、選ばれた行に対して働く。
		const selected = this.getSelectedItems();
		const targets = selected.length > 0 ? selected : [candidate];
		const menu = this.replaceActiveMenu(new PaletteMenu());
		this.populateSelectionMenu(menu, targets, () => this.close());
		this.addCheckMenuItems(menu, targets);
		this.addRemovalMenuItem(menu, targets);
		menu.setParentElement(this.modalEl);
		showMenuAtEvent(menu, event);
	}

	protected override handlesSuggestionRowToggle(): boolean {
		return true;
	}

	/** 行のチェックのアイコンを押すと、何も実行せずにその行だけを切り替える。 */
	protected override onSuggestionRowToggle(candidate: MultiSelectCandidate<V>): void {
		this.toggleChecks([candidate]);
	}

	// Why: パネルは行の mousedown の伝播を止めるので、ユーザーが行をクリックしても、
	// Obsidian 自身は開いたメニューを閉じられない。
	protected override onResultFocus(): void {
		this.activeMenu?.close();
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-multi-select");
		this.createCheckedButton();
	}

	protected override handlesSelectionSpace(): boolean {
		return true;
	}

	/** スペースは、強調表示の選択を変える代わりに、挿入の候補をチェックする。 */
	protected override onSelectionSpace(selected: MultiSelectCandidate<V>[]): void {
		this.toggleChecks(selected);
	}

	protected override onSelectionModalClose(): void {
		this.activeMenu?.close();
		this.resolveResult?.(this.confirmedChanges ?? null);
		this.resolveResult = undefined;
	}

	protected override async onItemActivated(
		candidate: MultiSelectCandidate<V>,
		event: Event,
	): Promise<void> {
		// Ctrl+Enter はどの行からでも実行できるので、一覧から離れる必要がない。
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (runShortcut) {
			// 保留中の変更が優先する。なければ、強調表示の追加する行を実行する。
			this.confirm(
				this.toggled.size > 0
					? pendingChanges(this.pendingCandidates(), this.toggledKeys())
					: directChanges(this.getSelectedItems().filter(({ applied }) => !applied)),
			);
			return;
		}
		if (event.type !== "keydown") {
			const rows = [...this.getSelectedItems()];
			if (!rows.some(({ key }) => key === candidate.key)) rows.push(candidate);
			this.confirm(directChanges(rows));
			return;
		}
		// 閉じる前に警告する。複数選択は Ctrl+Enter でも実行できるままにするため。
		if (this.toggled.size > 1 || this.getSelectedItems().length > 1) {
			new Notice(
				t("multi.enterWarning", {
					action: this.multiSelect.actionLabel,
					label: candidate.item.label,
				}),
			);
			return;
		}
		this.confirm(directChanges([candidate]));
	}

	/** 与えられた変更で閉じる。適用するものがなければ、モーダルは開いたままになる。 */
	private confirm(changes: MultiSelectChanges<V>): void {
		if (changeCount(changes) === 0) return;
		this.commitSearchHistory();
		this.confirmedChanges = changes;
		this.close();
	}

	/** 与えられたすべての行をチェックする。すでにすべてチェック済みなら、すべて外す。 */
	private toggleChecks(candidates: readonly MultiSelectCandidate<V>[]): void {
		if (candidates.length === 0) return;
		const allChecked = candidates.every((candidate) => this.isChecked(candidate));
		for (const candidate of candidates) {
			if (this.isChecked(candidate) === allChecked) this.flip(candidate);
		}
		// アイコンをすぐに更新し、同じ順序で一覧を組み直す。カーソルと選択は、古い行の番号ではなく
		// キーで保つ。
		this.rerenderVisibleSuggestions();
		this.refreshKeepingSelection();
	}

	/** 1つの行を切り替える。開始時の状態に戻った行は、保留中の変更から外れる。 */
	private flip(candidate: MultiSelectCandidate<V>): void {
		if (this.toggled.has(candidate.key)) this.toggled.delete(candidate.key);
		else this.toggled.set(candidate.key, candidate);
	}

	/** 保留中の変更をすべて捨てる。適用済みの行は、再びチェック済みとして表示される。 */
	private clearPendingChanges(): void {
		this.toggled.clear();
		this.refreshKeepingSelection();
	}

	private refreshKeepingSelection(): void {
		this.updateCheckedButton();
		this.keepListedOrder = true;
		this.refreshSuggestionsKeepingSelection((a, b) => a.key === b.key);
	}

	private replaceActiveMenu(menu: PaletteMenu): PaletteMenu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private addCheckMenuItems(
		menu: PaletteMenu,
		targets: readonly MultiSelectCandidate<V>[],
	): void {
		// 強調表示の行は、保留中の行に加わる。複数をチェックして実行するのが1手で済むように。
		const runSet = new Map(this.toggled);
		for (const candidate of targets) runSet.set(candidate.key, candidate);
		if (runSet.size === 0) return;
		const changes = pendingChanges([...runSet.values()], this.toggledKeys());
		menu.addSeparator();
		if (targets.length > 0) {
			const allChecked = targets.every((candidate) => this.isChecked(candidate));
			const suffix =
				targets.length > 1 ? t("multi.suffixSelected", { count: targets.length }) : "";
			menu.addItem((item) =>
				item
					.setTitle(`${allChecked ? t("multi.uncheck") : t("multi.check")}${suffix}`)
					.setIcon(allChecked ? ICONS.unchecked : ICONS.checked)
					.onClick(() => this.toggleChecks(targets)),
			);
		}
		if (changeCount(changes) === 0) return;
		const addsPending = targets.some((candidate) => !this.isChecked(candidate));
		menu.addItem((item) =>
			item
				.setTitle(
					runTitle(
						changes,
						this.multiSelect.actionLabel,
						addsPending ? "now" : "checked",
					),
				)
				.setIcon(ICONS.confirm)
				.onClick(() => this.confirm(changes)),
		);
	}

	private addRemovalMenuItem(
		menu: PaletteMenu,
		targets: readonly MultiSelectCandidate<V>[],
	): void {
		const removable = targets.filter((candidate) => candidate.removal);
		if (removable.length === 0) return;
		const label = removable[0].removal?.label ?? "";
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(
					removable.length > 1
						? t("multi.removalSelected", { label, count: removable.length })
						: label,
				)
				.setIcon(ICONS.delete)
				.onClick(() => {
					void (async () => {
						// Why: 削除は同じノートを書き換えることがあるので、1つずつ実行する。
						for (const candidate of removable) {
							await candidate.removal?.run();
							// 削除が実際に行われたので、その行を保留のままにしてはいけない。
							this.toggled.delete(candidate.key);
						}
						this.refreshKeepingSelection();
					})();
				}),
		);
	}

	/** 入力欄の前に置くボタン。チェックした行をプレビューし、実行する。 */
	private createCheckedButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		container.querySelector(".my-palette-checked-button")?.remove();
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-checked-button",
			attr: { type: "button", title: t("multi.checkedButton") },
		});
		container.insertBefore(button, container.querySelector(".my-palette-options-button"));
		setIcon(button, ICONS.selection);
		this.checkedCountEl = button.createSpan("my-palette-checked-button__count");
		this.checkedButtonEl = button;
		// クリックの後も、入力欄にフォーカスを保つ。入力とキーボードの選択を続けられるように。
		this.registerSelectionDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.registerSelectionDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.showCheckedMenu(event);
		});
		this.updateCheckedButton();
	}

	private updateCheckedButton(): void {
		if (!this.checkedButtonEl) return;
		const changes = pendingChanges(this.pendingCandidates(), this.toggledKeys());
		this.checkedButtonEl.hidden = this.toggled.size === 0;
		this.checkedCountEl?.setText(summarizeChanges(changes));
	}

	private showCheckedMenu(event: MouseEvent): void {
		if (this.toggled.size === 0) return;
		const changes = pendingChanges(this.pendingCandidates(), this.toggledKeys());
		const menu = this.replaceActiveMenu(new PaletteMenu());
		menu.addItem((item) =>
			item
				.setTitle(runTitle(changes, this.multiSelect.actionLabel, "checked"))
				.setIcon(ICONS.confirm)
				.onClick(() => this.confirm(changes)),
		);
		menu.addSeparator();
		// ここで保留中の行を選ぶと元に戻るので、この一覧は編集もできる。
		for (const candidate of this.toggled.values()) {
			menu.addItem((item) =>
				item
					.setTitle(candidate.item.label)
					.setIcon(this.isChecked(candidate) ? ICONS.checked : ICONS.unchecked)
					.onClick(() => this.toggleChecks([candidate])),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.clearChanges).onClick(() => this.clearPendingChanges()),
		);
		menu.setParentElement(this.modalEl);
		showMenuAtEvent(menu, event);
	}

	private toSelectionItem(candidate: MultiSelectCandidate<V>): SelectionItem {
		return {
			...candidate.item,
			icon: this.isChecked(candidate)
				? "square-check"
				: (candidate.uncheckedIcon ?? "square"),
		};
	}
}
