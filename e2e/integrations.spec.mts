import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, PLUGIN_ID, pluginVaultOptions, runPaletteCommand, t } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

type IntegrationSettings = { integrations: { everything: { enabled: boolean } } };

test("turning Everything off removes its modes from Home and alias entry", async ({ obsidian }) => {
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, {
		subPage: t("settings.integrations.name"),
	});
	const everything = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Everything", { exact: true }) })
		.first();
	await everything.locator(".checkbox-container").click();
	await expect
		.poll(async () => {
			const settings = await obsidian.pluginSettings<IntegrationSettings>(PLUGIN_ID);
			return settings.integrations.everything.enabled;
		})
		.toBe(false);
	await obsidian.closeSettings();

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.waitFor();
	await expect(page.locator(".my-palette-suggest-modal")).not.toContainText("Everything");
	await input.pressSequentially("e ");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("e ");
	await input.press("Escape");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveCount(0);
});

test("the Everything card opens its settings without interfering with its controls", async ({
	obsidian,
}) => {
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, {
		subPage: t("settings.integrations.name"),
	});
	const header = settingsPage.getByRole("button", { name: "Everything", exact: true });
	const panel = settingsPage.locator("#my-palette-everything-panel");
	await expect(header).toHaveAttribute("aria-expanded", "false");
	await expect(panel).toBeHidden();
	await header.locator(".setting-item-description").click();
	await expect(header).toHaveAttribute("aria-expanded", "true");
	await expect(
		panel.getByText(t("settings.everything.resultsTiming"), { exact: true }),
	).toBeVisible();
	await expect(
		panel.getByText(t("settings.everything.item.timeout"), { exact: true }),
	).toBeVisible();
	await settingsPage.locator(".my-palette-accordion__header .checkbox-container").click();
	await expect(header).toHaveAttribute("aria-expanded", "true");
	await panel.getByRole("textbox").first().fill("http://127.0.0.1:51361/");
	await expect(panel).toBeVisible();
	await header.focus();
	await header.press("Space");
	await expect(panel).toBeHidden();
	await header.press("Enter");
	await expect(panel).toBeVisible();
	await settingsPage.locator(".my-palette-accordion__header").click({ position: { x: 5, y: 5 } });
	await expect(panel).toBeHidden();
});
