import { Component } from "obsidian";
import { ExtendedSelection } from "src/ui/extendedSelection";
import { markKeyboardMenuEvent } from "src/ui/menus";
import type { SuggestionPanelProps } from "src/ui/suggestionPanel";

interface PointerActionsHost<T> {
	component: Component;
	props: SuggestionPanelProps<T>;
	selectionMode: "single" | "extended";
	extendedSelection: ExtendedSelection;
	chooser: { values: T[]; selectedItem: number };
	resultContainerEl: HTMLElement;
	focusResults: () => void;
	restoreFocusFromListSpace: (event: MouseEvent) => void;
	itemAtRow: (row: Element) => T | undefined;
	setSelectedIndex: (index: number, scroll: boolean) => void;
	getSelectedItem: () => T | undefined;
	getSelectedItems: () => T[];
}

export class SuggestionPointerActions<T> {
	private readonly leftClickRows = new WeakSet<Element>();
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();

	constructor(private readonly host: PointerActionsHost<T>) {}

	register(): void {
		// Component のアンロードは、すべてのリスナーを外す。そのため、同じモーダルを開き直すたびに、
		// ここで登録し直す必要がある。
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"pointermove",
			(event) => this.handlePointerMove(event),
			true,
		);
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"mousedown",
			(event) => this.handleMouseDown(event),
			true,
		);
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"dblclick",
			(event) => this.handleDoubleClick(event),
			true,
		);
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"auxclick",
			(event) => this.handleAuxClick(event),
			true,
		);
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"click",
			(event) => this.handleClick(event),
			true,
		);
		this.host.component.registerDomEvent(
			this.host.resultContainerEl,
			"contextmenu",
			(event) => this.handleContextMenu(event),
			true,
		);
	}

	private handlePointerMove(event: PointerEvent): void {
		if (this.host.selectionMode === "extended") return;
		const row = this.suggestionRowAtEvent(event);
		if (!row) return;
		const index = Number(row.getAttribute("data-index"));
		if (Number.isInteger(index)) this.host.setSelectedIndex(index, false);
	}

	private handleMouseDown(event: MouseEvent): void {
		// 結果のクリックは、ユーザーの注意を入力からの一覧へ移す、具体的なブラウザーのイベント。
		// モーダルの一覧の余白のクリックも、昔から検索語を確定してきた。ビューにはテーブルの
		// ヘッダーもあるので、実際の結果の行だけを確定する。
		const modal = this.host.props.surface !== "view";
		if (modal) this.host.focusResults();
		const row = this.suggestionRowAtEvent(event);
		if (!row) {
			this.host.restoreFocusFromListSpace(event);
			return;
		}
		// 並べ替えのヘッダーも結果のコンテナを共有する。しかし、検索を利用履歴に記録するのは、
		// 実際の結果とのやり取りだけにする。
		if (!modal) this.host.focusResults();
		const item = this.host.itemAtRow(row);
		if (item === undefined) return;
		// Why: 中クリックの保護は click/auxclick までの間保ち、次の押下でリセットする。
		// 1回のジェスチャーで同じノートを2回開かないようにするため。
		this.middleClickRows.delete(row);
		const index = Number(row.getAttribute("data-index"));
		if (event.button === 0 && this.isRowToggleEvent(event)) {
			// Why: チェックの操作は、その行で即座に動く。押下をそのまま通すと、強調表示の選択も変わる。
			event.preventDefault();
			event.stopImmediatePropagation();
			this.leftClickRows.add(row);
			this.host.props.onRowToggle?.(item, event);
		} else if (
			event.button === 0 &&
			this.host.props.activateOnClick?.(item) &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.leftClickRows.add(row);
			this.host.setSelectedIndex(index, false);
			void this.host.props.onChoose(item, event);
		} else if (event.button === 0 && this.host.selectionMode === "extended") {
			// Why: サイドバーは、mousedown の後に Obsidian にクリックを奪われることがある。
			// 今ここで選び、開く操作はダブルクリックと Enter だけに任せる。
			event.preventDefault();
			event.stopImmediatePropagation();
			this.leftClickRows.add(row);
			this.host.extendedSelection.select(index, this.host.chooser.values.length, {
				toggle: event.ctrlKey || event.metaKey,
				range: event.shiftKey,
			});
			this.host.setSelectedIndex(index, false);
		} else if (event.button === 0 && this.host.props.surface === "view") {
			// サイドバーのクリックは、mousedown の後に Obsidian に消費されることがある。そのため、
			// 主な操作はここで実行し、後のクリックはガードを外すだけにする。
			// 単一選択のモーダルは、通常のクリックでの有効化を保つ。
			event.preventDefault();
			event.stopImmediatePropagation();
			this.leftClickRows.add(row);
			this.host.setSelectedIndex(index, false);
			void this.host.props.onChoose(item, event);
		} else if (event.button === 1 && this.host.props.onMiddleClick) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.handleMiddleClick(row, event);
		} else if (event.button === 2 && this.host.props.onContextMenu) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.rightClickRows.add(row);
			if (this.host.selectionMode === "extended")
				this.host.extendedSelection.selectForContextMenu(
					index,
					this.host.chooser.values.length,
				);
			this.host.setSelectedIndex(index, false);
		}
	}

	private handleDoubleClick(event: MouseEvent): void {
		if (this.host.selectionMode !== "extended" || event.button !== 0) return;
		// チェックの上で素早く2回押すと、すでに2回切り替わっている。その後に続く dblclick で、
		// さらに行を有効にしてはいけない。
		if (this.isRowToggleEvent(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		const row = this.suggestionRowAtEvent(event);
		const item = row ? this.host.itemAtRow(row) : undefined;
		if (!row || item === undefined) return;
		if (this.host.props.activateOnClick?.(item)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.host.setSelectedIndex(Number(row.getAttribute("data-index")), false);
		void this.host.props.onChoose(item, event);
	}

	private handleAuxClick(event: MouseEvent): void {
		if (event.button !== 1 && event.button !== 2) return;
		const row = this.suggestionRowAtEvent(event);
		if (!row) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		// Why: 補助の右クリックは、ホストが先行する mousedown を届けなかったとしても、
		// 決して中クリックの操作を使ってはいけない。
		if (event.button === 1) this.handleMiddleClick(row, event);
	}

	private handleClick(event: MouseEvent): void {
		// 中・右クリックの後に発火する click/auxclick の取りこぼしが、主な操作として onChoose へ
		// 落ちて、アクティブなタブを上書きしないよう、左クリック以外はここで確実に消費する。
		// Why: Electron/Windows の環境では、中クリックで click が、右クリックで click が飛ぶことがあり、
		// ガードの漏れが上書きの原因になっていた。
		if (event.button !== 0) {
			event.preventDefault();
			event.stopImmediatePropagation();
			// Why: 一部の Electron のホストは、中ボタンに auxclick の代わりに click を出す。
			// 通常の mousedown の経路とガードを共有する。
			const row = this.suggestionRowAtEvent(event);
			if (event.button === 1 && row) this.handleMiddleClick(row, event);
			return;
		}
		const row = this.suggestionRowAtEvent(event);
		if (!row) return;
		if (this.middleClickRows.has(row)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (this.leftClickRows.delete(row)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (this.rightClickRows.delete(row)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (this.host.selectionMode === "extended") return;
		const item = this.host.itemAtRow(row);
		if (item === undefined) return;
		this.host.setSelectedIndex(Number(row.getAttribute("data-index")), false);
		void this.host.props.onChoose(item, event);
	}

	private handleContextMenu(event: MouseEvent): void {
		if (!this.host.props.onContextMenu) return;
		const row = this.suggestionRowAtEvent(event);
		const item = row ? this.host.itemAtRow(row) : undefined;
		if (!row || item === undefined) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.rightClickRows.add(row);
		this.showRowContextMenu(Number(row.getAttribute("data-index")), item, event);
	}

	private showRowContextMenu(index: number, item: T, event: MouseEvent): void {
		if (this.host.selectionMode === "extended")
			this.host.extendedSelection.selectForContextMenu(
				index,
				this.host.chooser.values.length,
			);
		this.host.setSelectedIndex(index, false);
		this.host.props.onContextMenu?.(item, event, this.host.getSelectedItems());
	}

	/** コンテキストメニューのホットキーと同じく、アクティブな行の下にその行のメニューを開く。 */
	showActiveRowContextMenu(): void {
		const index = this.host.chooser.selectedItem;
		const item = this.host.getSelectedItem();
		const row = this.host.resultContainerEl.querySelector<HTMLElement>(
			`.suggestion-item[data-index="${index}"]`,
		);
		if (item === undefined || !row) return;
		row.scrollIntoView({ block: "nearest" });
		const rect = row.getBoundingClientRect();
		// Why: メニューのホストはマウスのイベントから位置を決めるので、キーボードの経路は、
		// アクティブな行のすぐ下に、ドロップダウンのように合成したイベントを置く。
		const event = markKeyboardMenuEvent(
			new MouseEvent("contextmenu", {
				clientX: rect.left,
				clientY: rect.bottom,
				view: row.win,
			}),
		);
		this.showRowContextMenu(index, item, event);
	}

	private handleMiddleClick(row: Element, event: MouseEvent): void {
		if (this.middleClickRows.has(row) || !this.host.props.onMiddleClick) return;
		const item = this.host.itemAtRow(row);
		if (item === undefined) return;
		this.middleClickRows.add(row);
		this.host.setSelectedIndex(Number(row.getAttribute("data-index")), false);
		void this.host.props.onMiddleClick(item, event);
	}

	private isRowToggleEvent(event: Event): boolean {
		if (!this.host.props.onRowToggle) return false;
		const target = event.target as Node | null;
		return Boolean(target?.instanceOf(Element) && target.closest("[data-row-toggle]"));
	}

	private suggestionRowAtEvent(event: Event): Element | undefined {
		const target = event.target as Node | null;
		// Why: 復元されたポップアウトのパネルは別の窓にノードを作る。その Element のコンストラクタは
		// プラグインの窓のものと違う。Obsidian は窓をまたいで確認する。
		if (!target?.instanceOf(Element)) return undefined;
		const row = target.closest(".suggestion-item");
		return row && this.host.resultContainerEl.contains(row) ? row : undefined;
	}
}
