import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "obsidian-e2e-toolkit";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	pluginVaultOptions,
	runPaletteCommand,
} from "../../e2e/support.mts";

// Captures every screen of the palette and its settings. Run with `pnpm ui:shots`,
// which sets UI_SHOT_DIR to a fresh run folder for each capture.
const outDir = process.env.UI_SHOT_DIR ?? path.join(os.tmpdir(), "my-palette-ui-screenshots");

test.use({ vaultOptions: pluginVaultOptions() });

function capture(page: Page, file: string): Promise<Buffer> {
	return page.screenshot({ path: path.join(outDir, file), animations: "disabled" });
}

/** Give rendering and the icon font a moment so every shot shows a settled list. */
async function settle(page: Page): Promise<void> {
	await page.waitForTimeout(400);
}

/** Opens the plugin's settings tab in its own window, then clicks the named page. */
async function openSettingsPage(obsidian: ObsidianAPI, name: string): Promise<Page> {
	const settingsOpened = obsidian.page.context().waitForEvent("page");
	await obsidian.evaluateApp(() => {
		const setting = (
			app as unknown as { setting: { open(): void; openTabById(id: string): void } }
		).setting;
		setting.open();
		setting.openTabById("my-palette");
	});
	const settingsPage = await settingsOpened;
	const item = settingsPage.locator(".setting-item-name").getByText(name, { exact: true });
	await expect(item).toBeVisible({ timeout: 10_000 });
	await item.click();
	return settingsPage;
}

function closeSettings(obsidian: ObsidianAPI): Promise<void> {
	return obsidian.evaluateApp(() =>
		(app as unknown as { setting: { close(): void } }).setting.close(),
	);
}

test("capture palette screenshots", async ({ obsidian }) => {
	await obsidian.waitReady();
	await mkdir(outDir, { recursive: true });

	for (const [name, body] of [
		["Projects/Launch plan.md", "# Launch plan\n\nSee [[Meeting notes]]."],
		["Projects/Roadmap 2026.md", "# Roadmap\n\n#project"],
		["Meeting notes.md", "# Meeting notes\n\n[[Launch plan]] and [[Roadmap 2026]]"],
		["Daily/2026-10-12.md", "# 2026-10-12\n\n[[Meeting notes]]"],
		["Reading list.md", "# Reading list"],
		["Inbox.md", "# Inbox\n\n[[Meeting notes]]"],
	] as const)
		await obsidian.createNote(name, body);
	await obsidian.open("Meeting notes.md");

	const page = obsidian.page;
	await page.setViewportSize({ width: 1100, height: 760 });
	await page.evaluate(() => {
		document.body.classList.remove("theme-light");
		document.body.classList.add("theme-dark");
	});

	// 1. Root Search: modes above the recent files.
	await runPaletteCommand(obsidian, "open-root");
	const input = page.locator(MODAL_INPUT);
	await input.waitFor();
	await expect(page.locator(".my-palette-section-heading").first()).toHaveText("Modes");
	await settle(page);
	await capture(page, "01-palette-root.png");

	// 2. Typing an alias puts its mode first, with matching files below.
	await input.pressSequentially("e");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Everything");
	await settle(page);
	await capture(page, "02-palette-root-alias.png");

	// 3. Enter moves into the mode: the alias becomes a chip and the input is empty.
	await input.press("Enter");
	await expect(page.locator(".my-palette-mode-chip")).toBeVisible();
	await expect(input).toHaveValue("");
	// Everything is not running here, so the mode settles on its connection error.
	await expect(page.locator(".my-palette-suggest-modal .suggestion-empty")).not.toHaveText(
		"Searching…",
		{ timeout: 15_000 },
	);
	await settle(page);
	await capture(page, "03-palette-mode-e.png");

	// 4. Esc returns to Root Search with the alias selected, one Enter from the mode.
	await input.press("Escape");
	await expect(page.locator(".my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("e");
	await settle(page);
	await capture(page, "04-palette-back-to-root.png");

	// 5. `alias + Space` still enters a mode directly; here, commands.
	await input.fill("");
	await input.pressSequentially("> link");
	await expect(input).toHaveValue("link");
	await settle(page);
	await capture(page, "05-palette-direct-command.png");

	// 6. A mode with results: backlinks of the active note.
	await input.press("Escape");
	await input.fill("");
	await input.pressSequentially("b");
	await settle(page);
	await capture(page, "06-palette-root-b.png");
	await input.fill("b ");
	await expect(page.locator(".my-palette-mode-chip")).toBeVisible();
	await settle(page);
	await capture(page, "07-palette-mode-backlinks.png");

	// 7. Backspace in the empty input behaves like Esc.
	await input.press("Backspace");
	await expect(input).toHaveValue("b");
	await input.press("Escape");
	await page.locator(".my-palette-suggest-modal").waitFor({ state: "detached" });

	// 8. The file-only palette (`Open recent palette`) has no mode rows.
	await runPaletteCommand(obsidian, "open");
	await input.waitFor();
	await expect(page.locator(".my-palette-section-heading")).toHaveCount(0);
	await settle(page);
	await capture(page, "08-palette-file-only.png");
});

// Each settings page opens in a fresh settings window, so the pages are captured one by one.
for (const [name, file] of [
	["General", "09-settings-general.png"],
	["Modes", "10-settings-modes.png"],
	["File search", "11-settings-file-search.png"],
	["Shortcuts", "12-settings-shortcuts.png"],
	["Integrations", "13-settings-integrations.png"],
] as const) {
	test(`capture the ${name} settings page`, async ({ obsidian }) => {
		await obsidian.waitReady();
		await mkdir(outDir, { recursive: true });
		const settingsPage = await openSettingsPage(obsidian, name);
		await settle(settingsPage);
		await capture(settingsPage, file);
		await closeSettings(obsidian);
	});
}
