import { DEFAULT_HOTKEYS, matchesHotkey, type PaletteHotkeys } from "src/ui/hotkeys";

export type InteractionMode = "input" | "selection";

/** キー入力がモードに対して何を意味するか。パネルがその一覧で実行する。 */
export type InteractionModeCommand = "to-input" | "enter-list" | "selection-space";

/**
 * 1キーの操作(チェックのスペース、戻る f)が検索語に届いてはいけないセレクターのための、入力/選択モード。
 * パネルとは分けてあるので、パレットのようにそうした操作を持たない外枠は、モードを off のままにでき、
 * Enter と強調表示の先頭の行が入力欄から直接動き続ける。
 */
export class InteractionModes {
	private mode: InteractionMode = "input";

	constructor(
		private readonly rootEl: HTMLElement,
		private readonly inputEl: HTMLInputElement,
		private readonly getHotkeys: () => PaletteHotkeys = () => DEFAULT_HOTKEYS,
	) {}

	set(mode: InteractionMode): void {
		this.mode = mode;
		this.rootEl.classList.toggle("is-input-mode", mode === "input");
		// 入力・貼り付け・IME がクエリを変えないよう止めつつ、一覧のキー操作のための DOM フォーカスは保つ。
		// ユーザーが明示的に入力モードへ戻るまで、それは続く。
		this.inputEl.readOnly = mode === "selection";
	}

	/** キー入力を分類する。undefined なら、パネルの通常の処理に任せる。 */
	command(event: KeyboardEvent, atFirstRow: boolean): InteractionModeCommand | undefined {
		if (event.isComposing) return undefined;
		const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
		if (this.mode === "input") return arrow ? "enter-list" : undefined;
		// Why: 入力欄から ArrowDown で一覧に入るので、先頭の行から ArrowUp を押したら、
		// 行き止まりで止まらず、対称に一覧から出るべき。Shift は範囲を広げるので、
		// 単独の ArrowUp だけが出る。
		if (event.key === "ArrowUp")
			return atFirstRow &&
				!event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey
				? "to-input"
				: undefined;
		const hotkeys = this.getHotkeys();
		if (matchesHotkey(event, hotkeys.focusInput)) return "to-input";
		if (matchesHotkey(event, hotkeys.toggleSelection, true)) return "selection-space";
		return undefined;
	}
}
