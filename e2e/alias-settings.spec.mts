import type { Page } from "@playwright/test";
import { expect, test } from "obsidian-e2e-toolkit";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, MODAL_ROW, pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

async function openPaletteSettings(obsidian: ObsidianAPI): Promise<Page> {
	const settingsOpened = obsidian.page.context().waitForEvent("page");
	await obsidian.evaluateApp(() => {
		const setting = (
			app as unknown as { setting: { open(): void; openTabById(id: string): void } }
		).setting;
		setting.open();
		setting.openTabById("my-palette");
	});
	const settingsPage = await settingsOpened;
	const modesPage = settingsPage.locator(".setting-item-name").filter({ hasText: /^Modes$/ });
	await expect(modesPage).toBeVisible({ timeout: 10_000 });
	await modesPage.click();
	return settingsPage;
}

function storedCommandAlias(obsidian: ObsidianAPI): Promise<string> {
	return obsidian.evaluateApp(
		() =>
			(
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							{ settings: { modes: { commands: { alias: string } } } }
						>;
					};
				}
			).plugins.plugins["my-palette"].settings.modes.commands.alias,
	);
}

test("mode aliases can be changed on the Modes page and are used in Home", async ({ obsidian }) => {
	await obsidian.waitReady();
	const settingsPage = await openPaletteSettings(obsidian);
	const row = (name: string) =>
		settingsPage
			.locator(".setting-item")
			.filter({ has: settingsPage.getByText(name, { exact: true }) });
	const commandInput = row("Commands").getByRole("textbox");
	await expect(commandInput).toHaveValue(">");
	// Aliases are stored without a trailing space, so the field shows the alias alone.
	await expect(row("Vault notes").getByRole("textbox")).toHaveValue("e");

	await commandInput.fill("esdir");
	await expect(row("Commands")).toContainText("already used by another mode");
	expect(await storedCommandAlias(obsidian)).toBe(">");

	await commandInput.fill("c");
	await expect.poll(() => storedCommandAlias(obsidian)).toBe("c");
	// Close through Obsidian: closing the window alone leaves the settings modal registered.
	await obsidian.evaluateApp(() =>
		(app as unknown as { setting: { close(): void } }).setting.close(),
	);

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.pressSequentially("c");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Commands");
	await input.pressSequentially(" link search");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toHaveText("c");
	await expect(input).toHaveValue("link search");
});

test("a mode turned off on the Modes page leaves Home and alias entry", async ({ obsidian }) => {
	await obsidian.waitReady();
	const settingsPage = await openPaletteSettings(obsidian);
	const bookmarks = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Bookmarks", { exact: true }) });
	// Obsidian switches flip when their label is clicked; the input inside is not clickable.
	await bookmarks.locator(".checkbox-container").click();
	await expect.poll(() => storedModeEnabled(obsidian, "bookmarks")).toBe(false);
	await obsidian.evaluateApp(() =>
		(app as unknown as { setting: { close(): void } }).setting.close(),
	);

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.waitFor();
	await expect(page.locator(".my-palette-suggest-modal")).not.toContainText("Bookmarks");
	await input.pressSequentially("bk ");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("bk ");
});

function storedModeEnabled(obsidian: ObsidianAPI, id: string): Promise<boolean> {
	return obsidian.evaluateApp(
		(modeId) =>
			(
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							{ settings: { modes: Record<string, { enabled: boolean }> } }
						>;
					};
				}
			).plugins.plugins["my-palette"].settings.modes[modeId].enabled,
		id,
	);
}
