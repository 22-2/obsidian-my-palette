import { describe, expect, it, vi } from "vitest";
import { mergeSettings } from "src/settings/mergeSettings";
import { PaletteDisplaySettingsStore } from "src/settings/paletteDisplaySettingsStore";

describe("PaletteDisplaySettingsStore", () => {
	it("updates and persists only the selected surface while notifying its subscribers", async () => {
		const settings = mergeSettings(undefined);
		const save = vi.fn(async () => {});
		const store = new PaletteDisplaySettingsStore(() => settings, save);
		const table = vi.fn();
		const secondTable = vi.fn();
		const view = vi.fn();
		const palette = vi.fn();
		store.subscribe("table", table);
		store.subscribe("table", secondTable);
		store.subscribe("view", view);
		store.subscribe("palette", palette);
		await store.toggleHighlight("table");
		expect(table).toHaveBeenLastCalledWith({ highlightSearchMatches: false });
		expect(secondTable).toHaveBeenLastCalledWith({ highlightSearchMatches: false });
		expect(view).toHaveBeenCalledTimes(1);
		expect(palette).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledOnce();
		const restored = mergeSettings(JSON.parse(JSON.stringify(settings)));
		expect(restored.paletteDisplay).toEqual({
			table: { highlightSearchMatches: false },
			view: { highlightSearchMatches: true },
			palette: { highlightSearchMatches: true },
		});
	});

	it("releases closed surface listeners and isolates plugin state", async () => {
		const settings = mergeSettings(undefined);
		const otherSettings = mergeSettings(undefined);
		const store = new PaletteDisplaySettingsStore(
			() => settings,
			async () => {},
		);
		const otherStore = new PaletteDisplaySettingsStore(
			() => otherSettings,
			async () => {},
		);
		const closed = vi.fn();
		const other = vi.fn();
		const unsubscribe = store.subscribe("view", closed);
		otherStore.subscribe("view", other);
		unsubscribe();
		await store.toggleHighlight("view");
		expect(closed).toHaveBeenCalledTimes(1);
		expect(other).toHaveBeenCalledTimes(1);
		expect(otherStore.get("view").highlightSearchMatches).toBe(true);
		const listener = vi.fn();
		store.subscribe("view", listener);
		expect(listener).toHaveBeenLastCalledWith({ highlightSearchMatches: false });
		store.dispose();
		await store.toggleHighlight("view");
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
