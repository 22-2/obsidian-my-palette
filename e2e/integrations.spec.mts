import type { Page } from "@playwright/test";
import { expect, test } from "obsidian-e2e-toolkit";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

/** Opens the Integrations page of the settings window, which is a separate page. */
async function openIntegrations(obsidian: ObsidianAPI): Promise<Page> {
	const settingsOpened = obsidian.page.context().waitForEvent("page");
	await obsidian.evaluateApp(() => {
		const setting = (
			app as unknown as { setting: { open(): void; openTabById(id: string): void } }
		).setting;
		setting.open();
		setting.openTabById("my-palette");
	});
	const settingsPage = await settingsOpened;
	const item = settingsPage.locator(".setting-item-name").filter({ hasText: /^Integrations$/ });
	await expect(item).toBeVisible({ timeout: 10_000 });
	await item.click();
	return settingsPage;
}

function closeSettings(obsidian: ObsidianAPI): Promise<void> {
	return obsidian.evaluateApp(() =>
		(app as unknown as { setting: { close(): void } }).setting.close(),
	);
}

test("turning Everything off removes its modes from Home and alias entry", async ({ obsidian }) => {
	await obsidian.waitReady();
	const settingsPage = await openIntegrations(obsidian);
	const everything = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Everything", { exact: true }) })
		.first();
	await everything.locator(".checkbox-container").click();
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					(
						app as unknown as {
							plugins: {
								plugins: Record<
									string,
									{
										settings: {
											integrations: { everything: { enabled: boolean } };
										};
									}
								>;
							};
						}
					).plugins.plugins["my-palette"].settings.integrations.everything.enabled,
			),
		)
		.toBe(false);
	await closeSettings(obsidian);

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.waitFor();
	await expect(page.locator(".my-palette-suggest-modal")).not.toContainText("Everything");
	await input.pressSequentially("e ");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("e ");
});

test("the Everything card opens its settings without interfering with its controls", async ({
	obsidian,
}) => {
	await obsidian.waitReady();
	const settingsPage = await openIntegrations(obsidian);
	const header = settingsPage.getByRole("button", { name: "Everything", exact: true });
	const panel = settingsPage.locator("#my-palette-everything-panel");
	await expect(header).toHaveAttribute("aria-expanded", "false");
	await expect(panel).toBeHidden();
	await header.locator(".setting-item-description").click();
	await expect(header).toHaveAttribute("aria-expanded", "true");
	await expect(panel.getByText("Results and timing", { exact: true })).toBeVisible();
	await expect(panel.getByText("Request timeout", { exact: true })).toBeVisible();
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
