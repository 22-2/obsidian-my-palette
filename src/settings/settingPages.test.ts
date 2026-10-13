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
describe("settings page layout", () => {
	it("hides unready integrations from Modes while leaving built-in modes available", () => {
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
		expect(visibleNames()).toContain("Notes");
		readiness.everything = true;
		expect(visibleNames()).toContain("Everything");
	});
	it("keeps related controls discoverable in task-oriented pages", () => {
		const pages = createSettingPages({} as SettingsHost);

		expect(pages.filter(isPage).map((page) => page.name)).toEqual([
			"General",
			"Modes",
			"File search",
			"Shortcuts",
			"Integrations",
		]);

		const [general, modes, fileSearch, hotkeys, integrations] = pages.filter(isPage);
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
			"Home",
			"Tabs",
			"Search history",
			"Display",
			"Diagnostics",
		]);
		expect(groupsOf(fileSearch).map((group) => group.heading)).toEqual([
			"File types",
			"Excluded folders",
			"Lower prior folders",
			"Obsidian-excluded files index",
			"Result sorting",
		]);
		expect(groupsOf(integrations).map((group) => group.heading)).toEqual(["Integrations"]);
		expect(
			groupsOf(integrations)[0].items?.map((item) =>
				"name" in item ? item.name : undefined,
			),
		).toEqual(["Everything", "Smart Connections", "VS Code"]);
	});
});
