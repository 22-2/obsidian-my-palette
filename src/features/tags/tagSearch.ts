import { Notice, type App } from "obsidian";
import { t } from "src/i18n";
import { getGlobalSearch } from "src/platform/obsidianInternals";

/**
 * コアの全体検索で `tag:#name` を開く。`active` が真なら検索のリーフを有効にする。
 * 全体検索のコアプラグインがなければ通知して false を返す。
 */
export function openTagSearch(app: App, tagName: string, active: boolean): boolean {
	const search = getGlobalSearch(app);
	if (!search) {
		new Notice(t("tag.notice.noSearchCore"));
		return false;
	}
	search.openGlobalSearch(`tag:#${tagName}`, active);
	return true;
}
