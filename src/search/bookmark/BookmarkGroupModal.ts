import type { App } from "obsidian";
import { bookmarkGroupRows, type BookmarkGroupItem } from "src/search/bookmark/bookmarkGroupRows";
import {
	bookmarkLabel,
	type BookmarkEntry,
	type BookmarksInstance,
} from "src/search/bookmark/bookmarks";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

interface BookmarkGroupOptions {
	placeholder: string;
	footerText: string;
	/** 選んだグループに操作を適用する。undefined は最上位を意味する。 */
	onChoose: (parent: BookmarkEntry | undefined, item: BookmarkGroupItem) => void;
	createGroup: (title: string) => BookmarkEntry;
}

/**
 * ブックマークのグループのセレクター: ブックマークを追加・移動する先のグループを選ぶ。
 * どの最上位のグループにもない名前を入力すると、そのグループを作ることを提案する。
 */
export class BookmarkGroupModal extends SelectionModal<BookmarkGroupItem> {
	constructor(
		app: App,
		instance: BookmarksInstance,
		private readonly options: BookmarkGroupOptions,
	) {
		super(
			{
				placeholder: options.placeholder,
				footerText: options.footerText,
				search: (query) => bookmarkGroupRows(instance.items ?? [], query),
			},
			app,
		);
	}

	protected override async onItemActivated(item: BookmarkGroupItem): Promise<void> {
		const { target } = item;
		const parent =
			target.kind === "top"
				? undefined
				: target.kind === "group"
					? target.group
					: this.options.createGroup(target.title);
		this.close();
		this.options.onChoose(parent, item);
	}
}

/**
 * ブックマークのタイトルを入力する1行の欄。Enter で入力したタイトルを適用する。空の入力は、
 * 既定のタイトル(ファイル名または検索語)に戻す。
 */
export class BookmarkTitleModal extends SelectionModal<SelectionItem> {
	constructor(
		app: App,
		entry: BookmarkEntry,
		private readonly onSubmit: (title: string) => void,
	) {
		const fallback = bookmarkLabel({ ...entry, title: undefined });
		super(
			{
				placeholder: t("bookmark.placeholder.title"),
				initialInput: entry.title ?? "",
				footerText: t("bookmark.footer.current", {
					target: entry.path ?? entry.query ?? fallback,
				}),
				search: (query) => [
					query.trim()
						? {
								label: t("bookmark.title.set", { title: query.trim() }),
								icon: ICONS.rename,
							}
						: {
								label: t("bookmark.title.useDefault"),
								description: fallback,
								icon: ICONS.reset,
							},
				],
			},
			app,
		);
	}

	protected override async onItemActivated(): Promise<void> {
		const title = this.inputEl.value;
		this.close();
		this.onSubmit(title);
	}
}
