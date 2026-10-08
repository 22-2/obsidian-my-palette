import { describe, expect, it, vi } from "vitest";
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
} from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import { createSettingPages } from "src/settings/settingPages";

vi.mock("obsidian", () => ({
	DropdownComponent: class {},
	Notice: class {},
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

describe("settings page layout", () => {
	it("keeps related controls discoverable in three task-oriented pages", () => {
		const pages = createSettingPages({} as SettingsHost, async () => {});

		expect(pages.filter(isPage).map((page) => page.name)).toEqual([
			"Palette",
			"Vault file search",
			"Everything",
		]);

		const [palette, fileSearch, everything] = pages.filter(isPage);
		expect(palette.desc).toContain("search history");
		expect(groupsOf(palette).map((group) => group.heading)).toEqual([
			"Palette behavior",
			"Search history",
			"Diagnostics",
		]);
		expect(groupsOf(fileSearch).map((group) => group.heading)).toEqual([
			"Excluded folders",
			"Lower prior folders",
			"Ignored note index",
			"Result sorting",
		]);
		expect(groupsOf(everything).map((group) => group.heading)).toEqual([
			"Connection",
			"Vault search",
		]);
	});
});
