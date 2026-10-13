import { expect, test } from "obsidian-e2e-toolkit";
import type { Page } from "@playwright/test";
import { MODAL_INPUT, MODAL_ROW, pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("Home opens each Settings entry directly by click, Enter or Tab", async ({
	obsidian,
}, testInfo) => {
	await obsidian.waitReady();
	await obsidian.createNote("Example.md", "# Example");
	const page = obsidian.page;
	let settingsWindow: Page | undefined;
	await page.setViewportSize({ width: 900, height: 900 });
	await page.evaluate(() => {
		document.body.classList.remove("theme-light");
		document.body.classList.add("theme-dark");
	});
	for (const [name, target, heading, action] of [
		["General", "General", "Return to Home after", "click"],
		["Modes", "Modes", "Search modes", "Enter"],
		["File search", "File search", "File types", "Tab"],
		["Shortcuts", "Shortcuts", "Palette and selector shortcuts", "Enter"],
		["Integration", "Integrations", "Integrations", "click"],
	] as const) {
		await runPaletteCommand(obsidian, "open-home");
		const input = page.locator(MODAL_INPUT);
		await input.fill("");
		await expect(page.locator(".my-palette-section-heading")).toHaveText([
			"Modes",
			"Settings",
			"Files",
		]);
		if (name === "General") {
			await page.screenshot({ path: testInfo.outputPath("home-settings.png") });
			await input.fill("settings");
			await expect(page.locator(MODAL_ROW)).toHaveCount(5);
		}
		await input.fill(name);
		const row = page.locator(MODAL_ROW).filter({ has: page.getByText(name, { exact: true }) });
		await expect(row).toHaveCount(1);
		const opened =
			settingsWindow && !settingsWindow.isClosed()
				? Promise.resolve(settingsWindow)
				: page.context().waitForEvent("page");
		if (action === "click") await row.click();
		else await input.press(action);
		const settings = await opened;
		settingsWindow = settings;
		await expect(settings.locator(".setting-page-title").last()).toHaveText(target);
		await expect(settings.getByText(heading, { exact: true }).last()).toBeVisible();
		await expect(page.locator(".my-palette-suggest-modal")).toHaveCount(0);
		if (name === "Integration") {
			await settings
				.getByRole("button", { name: "Everything", exact: true })
				.locator(".setting-item-description")
				.click();
			await expect(settings.locator("#my-palette-everything-panel")).toBeVisible();
			await settings.screenshot({ path: testInfo.outputPath("everything-card.png") });
		}
		await obsidian.evaluateApp(() =>
			(app as unknown as { setting: { close(): void } }).setting.close(),
		);
		await page.bringToFront();
	}
});
