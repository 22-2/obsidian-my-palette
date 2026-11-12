import { Notice, type App } from "obsidian";
import { ICONS } from "src/core/icons";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { t } from "src/i18n";

export interface ConfirmPaletteOptions {
	/** 何を確認するかの問い。入力欄の案内に出す。 */
	title: string;
	/** 操作の影響の説明。1つの文を1行にして並べる。 */
	paragraphs: readonly string[];
	/** 実行する行の文言。 */
	action: string;
	onConfirm: () => void;
}

/** 行の `value` で、キャンセルの行を見分ける。 */
const CANCEL = "cancel";

/**
 * 元に戻せない操作の確認。影響を行で並べ、Ctrl+Enter を押したときだけ実行する。
 * Esc、キャンセルの行、外側のクリックでは何も変えずに閉じる。
 */
export function openConfirmPalette(app: App, options: ConfirmPaletteOptions): void {
	new ConfirmPalette(app, options).open();
}

class ConfirmPalette extends SelectionModal<SelectionItem> {
	private confirmed = false;

	constructor(
		app: App,
		private readonly options: ConfirmPaletteOptions,
	) {
		super(
			{
				placeholder: options.title,
				search: () => this.rows(),
			},
			app,
		);
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-confirm");
		// Why: 入力は使わない。打てると、行が変わらないまま文字だけが残って、検索のように見えてしまう。
		this.inputEl.readOnly = true;
	}

	private rows(): SelectionItem[] {
		return [
			...this.options.paragraphs.map((text) => ({ label: text, icon: ICONS.info })),
			{ label: this.options.action, icon: ICONS.warning, badge: "Ctrl+Enter" },
			{ label: t("confirm.cancel"), icon: ICONS.close, badge: "Esc", value: CANCEL },
		];
	}

	protected override async onItemActivated(item: SelectionItem, event: Event): Promise<void> {
		if (item.value === CANCEL) {
			this.close();
			return;
		}
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (!runShortcut) {
			new Notice(t("confirm.notice.pressCtrlEnter", { action: this.options.action }));
			return;
		}
		// Why: キーを押しっぱなしにすると、閉じる前に続けて届く。実行は1回だけにする。
		if (this.confirmed) return;
		this.confirmed = true;
		this.close();
		this.options.onConfirm();
	}
}
