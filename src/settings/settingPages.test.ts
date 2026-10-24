import { describe, expect, it, vi } from "vitest";
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
} from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import { PALETTE_MODES } from "src/palette/modes";
import { createSettingPages } from "src/settings/settingPages";

vi.mock("obsidian", () => ({
	DropdownComponent: class {},
	Modal: class {},
	Notice: class {},
	Setting: class {},
}));

function isPage(item: SettingDefinitionItem): item is SettingDefinitionPage {
	return "type" in item && item.type === "page";
}

function isGroup(item: SettingDefinitionItem): item is SettingDefinitionGroup {
	return "type" in item && item.type === "group";
}

function groupsOf(page: SettingDefinitionPage): SettingDefinitionGroup[] {
	return (page.items ?? []).filter(isGroup);
}
describe("設定ページのレイアウト", () => {
	it("組み込みモードを利用可能なままにして、未準備の統合をモードから非表示にします", () => {
		const readiness = { everything: false, smartConnections: false };
		const pages = createSettingPages({
			integrationAvailability: { current: readiness },
		} as SettingsHost);
		const modes = pages.filter(isPage)[1];
		const visibleNames = () =>
			groupsOf(modes)[0]
				.items?.filter(
					(item) =>
						!("visible" in item) ||
						typeof item.visible !== "function" ||
						item.visible(),
				)
				.map((item) => ("name" in item ? item.name : undefined));
		expect(visibleNames()).not.toContain("Everything");
		expect(visibleNames()).not.toContain("Related notes");
		expect(visibleNames()).toContain("ノート");
		readiness.everything = true;
		expect(visibleNames()).toContain("Everything");
	});
	it("関連するコントロールをタスク指向のページで見つけられるようにする", () => {
		const pages = createSettingPages({} as SettingsHost);

		expect(pages.filter(isPage).map((page) => page.name)).toEqual([
			"一般",
			"モード",
			"ファイル検索",
			"ショートカット",
			"連携",
		]);

		const [general, modes, fileSearch, hotkeys, integrations] = pages.filter(isPage);
		expect(groupsOf(modes).map((group) => group.heading)).toEqual(["検索モード"]);
		expect(
			groupsOf(modes)[0].items?.map((item) => ("name" in item ? item.name : undefined)),
		).toEqual(PALETTE_MODES.map((mode) => mode.title));
		// The table is one row item; its contents are drawn by renderShortcutsTable.
		expect(groupsOf(hotkeys).map((group) => group.heading)).toEqual([
			"パレットとセレクターのショートカット",
		]);
		expect(general.desc).toContain("検索履歴");
		expect(groupsOf(general).map((group) => group.heading)).toEqual([
			"Home",
			"タブ",
			"検索履歴",
			"表示",
			"診断",
		]);
		expect(groupsOf(fileSearch).map((group) => group.heading)).toEqual([
			"ファイルの種類",
			"除外フォルダー",
			"優先度を下げるフォルダー",
			"Obsidian の除外ファイルの索引",
			"結果の並び順",
		]);
		expect(groupsOf(integrations).map((group) => group.heading)).toEqual(["連携"]);
		expect(
			groupsOf(integrations)[0].items?.map((item) =>
				"name" in item ? item.name : undefined,
			),
		).toEqual(["Everything", "Smart Connections", "VS Code"]);
	});
});
