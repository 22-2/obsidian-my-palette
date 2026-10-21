import { Notice, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { ActionKind } from "src/palette/resultActions";
import type { PaletteResult, TagResult } from "src/palette/results";
import { t } from "src/i18n";
import { mergeFrontmatterTags, updateFrontmatter } from "src/shared/frontmatter";
import { confirmDeleteTags } from "src/tags/tagDelete";
import { TagRenameModal } from "src/tags/TagRenameModal";
import { addMenuAction, MENU_ACTIONS } from "src/ui/menuActions";
import type { PaletteMenu } from "src/ui/paletteMenu";

export interface TagMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: PaletteMenu;
	tags: readonly TagResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	onNoteActionDone?: () => void;
}

/** 現在開いている Markdown ノートのフロントマターに、選んだタグを足す。 */
async function insertTagsIntoActiveNote(app: App, tagNames: readonly string[]): Promise<boolean> {
	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== "md") {
		new Notice(t("tag.notice.noActiveNote"));
		return false;
	}
	const applied = await updateFrontmatter(app, file, "insert tags", (frontmatter) => {
		frontmatter.tags = mergeFrontmatterTags(frontmatter.tags, tagNames);
	});
	if (applied) new Notice(t("tag.notice.inserted", { count: tagNames.length }));
	return applied;
}

/**
 * タグの結果の右クリックメニュー。タグの操作だけを出す。
 * 検索と名前の変更は1つ選んだときだけ（複数のタグは1つの検索にまとめられず、名前も1つしか変えられないため）。
 * 挿入と削除は、選んだすべてのタグに働く。
 */
export function populateTagMenu({
	app,
	menu,
	tags,
	activate,
	onNoteActionDone,
}: TagMenuOptions): void {
	const [single] = tags;
	const isSingle = tags.length === 1;
	const tagNames = tags.map((tag) => tag.tagName);
	if (single && isSingle) {
		addMenuAction(menu, MENU_ACTIONS.searchTag, () => void activate("primary", single));
	}
	addMenuAction(menu, MENU_ACTIONS.insertTagIntoActiveNote, () => {
		void insertTagsIntoActiveNote(app, tagNames).then((applied) => {
			if (applied) onNoteActionDone?.();
		});
	});
	menu.addSeparator();
	if (single && isSingle) {
		addMenuAction(menu, MENU_ACTIONS.renameTag, () => {
			new TagRenameModal(app, single.tagName, onNoteActionDone).open();
		});
	}
	// Why: 削除は元に戻せないので、名前の変更と同じく確認を挟む。
	addMenuAction(menu, MENU_ACTIONS.deleteTags, () => {
		confirmDeleteTags(app, tagNames, onNoteActionDone);
	});
}
