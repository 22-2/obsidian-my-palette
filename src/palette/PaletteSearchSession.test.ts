import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/settings/model";
import { IntegrationAvailability } from "src/app/integrationAvailability";
import { PaletteSearchSession, paletteSectionOf } from "src/palette/PaletteSearchSession";
import type { FileResult } from "src/palette/results";

async function host() {
	const settings = structuredClone(DEFAULT_SETTINGS);
	const integrationAvailability = new IntegrationAvailability(
		() => settings,
		async () => ({ ok: false, message: "Not configured" }),
		() => false,
	);
	await integrationAvailability.refresh();
	const file: FileResult = {
		id: "file:Example.md",
		mode: "file",
		primary: "Example",
		secondary: "Example.md",
		icon: "file",
		vaultPath: "Example.md",
	};
	const recordSearch = vi.fn();
	const plugin = {
		settings,
		integrationAvailability,
		providers: { file: { search: async () => [file] } },
		recordSearch,
	} as unknown as MyPalettePlugin;
	return { plugin, file, recordSearch };
}

describe("Home settings navigation", () => {
	it("groups settings between modes and files, even when all modes are disabled", async () => {
		const { plugin, file } = await host();
		for (const mode of Object.values(plugin.settings.modes)) mode.enabled = false;
		const session = new PaletteSearchSession(plugin, { modeEntries: true });
		const results = await session.search("");
		expect(
			results
				.filter((result) => result.mode === "settings-entry")
				.map((result) => result.primary),
		).toEqual(["General", "Modes", "File search", "Shortcuts", "Integration"]);
		expect(paletteSectionOf(session.current, results[0])).toBe("Settings");
		expect(paletteSectionOf(session.current, file)).toBe("Files");
		session.dispose();
	});

	it("keeps settings out of file-only palettes and Notes mode", async () => {
		const { plugin } = await host();
		const files = new PaletteSearchSession(plugin);
		expect((await files.search("")).some((result) => result.mode === "settings-entry")).toBe(
			false,
		);
		const home = new PaletteSearchSession(plugin, { modeEntries: true });
		home.enterMode("notes");
		expect((await home.search("")).some((result) => result.mode === "settings-entry")).toBe(
			false,
		);
		files.dispose();
		home.dispose();
	});
});
