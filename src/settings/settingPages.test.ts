import { describe, expect, it, vi } from "vitest";
import type {
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
} from "obsidian";
import type MyPalettePlugin from "src/main";
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
		const pages = createSettingPages({} as MyPalettePlugin, async () => {});

		expect(pages.filter(isPage).map((page) => page.name)).toEqual([
			"Palette",
			"Vault file search",
			"Everything",
		]);

		const [palette, fileSearch, everything] = pages.filter(isPage);
		expect(palette.desc).toContain("search history");
		expect(palette.desc).toContain("external Markdown");
		expect(groupsOf(palette).map((group) => group.heading)).toEqual([
			"Prefixes",
			"Palette behavior",
			"Search history",
			"File opening",
			"Diagnostics",
		]);
		expect(groupsOf(fileSearch).map((group) => group.heading)).toEqual([
			"Excluded folders",
			"Ignored note index",
			"Result sorting",
		]);
		expect(groupsOf(everything).map((group) => group.heading)).toEqual([
			"Connection",
			"Search",
			"Vault search",
		]);
	});
});
