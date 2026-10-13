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
	it("keeps related controls discoverable in task-oriented pages", () => {
		const pages = createSettingPages({} as SettingsHost, async () => {});

		expect(pages.filter(isPage).map((page) => page.name)).toEqual([
			"General",
			"Modes",
			"File search",
			"Shortcuts",
			"Everything",
		]);

		const [general, modes, fileSearch, hotkeys, everything] = pages.filter(isPage);
		expect(groupsOf(modes).map((group) => group.heading)).toEqual(["Search modes"]);
		expect(
			groupsOf(modes)[0].items?.map((item) => ("name" in item ? item.name : undefined)),
		).toEqual(PALETTE_MODES.map((mode) => mode.title));
		// The table is one row item; its contents are drawn by renderShortcutsTable.
		expect(groupsOf(hotkeys).map((group) => group.heading)).toEqual([
			"Palette and selector shortcuts",
		]);
		expect(general.desc).toContain("search history");
		expect(groupsOf(general).map((group) => group.heading)).toEqual([
			"Launcher",
			"Search history",
			"Display",
			"Diagnostics",
		]);
		expect(groupsOf(fileSearch).map((group) => group.heading)).toEqual([
			"File types",
			"Excluded folders",
			"Lower prior folders",
			"Ignored note index",
			"Result sorting",
			"Opening",
		]);
		expect(groupsOf(everything).map((group) => group.heading)).toEqual([
			"Connection",
			"Results and timing",
		]);
	});
});
