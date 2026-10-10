import { expect, test } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, openPaletteWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("Alt+H hides the modal while held and restores the focused input on release", async ({
	obsidian,
}) => {
	await obsidian.waitReady();
	const page = await openPaletteWith(obsidian, "preview query");
	const container = page.locator(".my-palette-modal-container");
	const input = page.locator(MODAL_INPUT);
	await page.keyboard.down("Alt");
	await page.keyboard.down("h");
	await expect(container).toHaveClass(/is-preview-hidden/);
	await expect(container).toBeHidden();
	await page.keyboard.up("h");
	await page.keyboard.up("Alt");
	await expect(container).toBeVisible();
	await expect(input).toBeFocused();
	await expect(input).toHaveValue("preview query");
});
