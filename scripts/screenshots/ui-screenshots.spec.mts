import { mkdir } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "obsidian-e2e-toolkit";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	PLUGIN_ID,
	pluginVaultOptions,
	rowLabels,
	runPaletteCommand,
} from "../../e2e/support.mts";

// Captures every screen of the palette and its settings. Run with `pnpm ui:shots`,
// which sets UI_SHOT_DIR to a fresh run folder for each capture.
const outDir = process.env.UI_SHOT_DIR ?? path.join(os.tmpdir(), "my-palette-ui-screenshots");

const CHIP = ".my-palette-mode-chip";
const EMPTY_STATE = ".my-palette-suggest-modal .suggestion-empty";

// Keep integration scenes independent of whether Everything is running locally.
let serverStatus = 200;
const server = http.createServer((_request, response) => {
	response.setHeader("Content-Type", "application/json");
	response.statusCode = serverStatus;
	response.end(JSON.stringify({ results: [] }));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;
test.use({
	vaultOptions: pluginVaultOptions({ everything: { httpUrl: `http://127.0.0.1:${port}/` } }),
});
test.beforeEach(async ({ obsidian }) => {
	serverStatus = 200;
	const result = await obsidian.evaluatePlugin<
		{ ok: boolean },
		{ testEverythingConnection(): Promise<{ ok: boolean }> }
	>(PLUGIN_ID, (plugin) => plugin.testEverythingConnection());
	expect(result.ok).toBe(true);
});
test.afterAll(() => server.close());

function capture(page: Page, file: string): Promise<Buffer> {
	return page.screenshot({ path: path.join(outDir, file), animations: "disabled" });
}

/**
 * Waits for web fonts and CSS animations. It does not wait for results: each scene asserts
 * its own mode, input and rows before calling this.
 */
async function settle(obsidian: ObsidianAPI, page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	await obsidian.waitForAnimations(page);
}

test("capture palette screenshots", async ({ obsidian }) => {
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
	const input = page.locator(MODAL_INPUT);
	await page.setViewportSize({ width: 1100, height: 760 });
	await obsidian.setTheme("dark", page);

	// 1. Home: modes above the recent files.
	await runPaletteCommand(obsidian, "open-home");
	await input.waitFor();
	await expect(page.locator(".my-palette-section-heading").first()).toHaveText("Modes");
	await expect(input).toHaveValue("");
	await settle(obsidian, page);
	await capture(page, "01-palette-root.png");

	// 2. Typing an alias puts its mode first, with matching files below.
	await input.pressSequentially("e");
	await expect(input).toHaveValue("e");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Everything");
	await settle(obsidian, page);
	await capture(page, "02-palette-root-alias.png");

	// 3. Enter moves into the mode: the alias becomes a chip and the input is empty.
	serverStatus = 503;
	await input.press("Enter");
	await expect(page.locator(CHIP)).toHaveText("e");
	await expect(input).toHaveValue("");
	// The stand-in service fails here, so the error scene is reproducible.
	await expect(page.locator(EMPTY_STATE)).toBeVisible({ timeout: 15_000 });
	await expect(page.locator(EMPTY_STATE)).not.toHaveText("Searching…");
	await settle(obsidian, page);
	await capture(page, "03-palette-mode-e.png");

	// 4. Esc returns to Home with the alias selected, one Enter from the mode.
	serverStatus = 200;
	expect(
		await obsidian.evaluatePlugin<
			{ ok: boolean },
			{ testEverythingConnection(): Promise<{ ok: boolean }> }
		>(PLUGIN_ID, (plugin) => plugin.testEverythingConnection()),
	).toEqual(expect.objectContaining({ ok: true }));
	await input.press("Escape");
	await expect(page.locator(CHIP)).toBeHidden();
	await expect(input).toHaveValue("e");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Everything");
	await settle(obsidian, page);
	await capture(page, "04-palette-back-to-root.png");

	// 5. `alias + Space` still enters a mode directly; here, commands.
	await input.fill("");
	await input.pressSequentially("> outgoing link list");
	await expect(page.locator(CHIP)).toHaveText(">");
	await expect(input).toHaveValue("outgoing link list");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Open outgoing link list");
	await settle(obsidian, page);
	await capture(page, "05-palette-direct-command.png");

	// 6. Back to Home with the query "b": Backlinks is the first row.
	await input.press("Escape");
	await input.fill("");
	await input.pressSequentially("b");
	await expect(input).toHaveValue("b");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Backlinks");
	await settle(obsidian, page);
	await capture(page, "06-palette-root-b.png");

	// 7. A mode with results: backlinks of the active note, one row per linking note.
	await input.fill("b ");
	await expect(page.locator(CHIP)).toHaveText("b");
	await expect(input).toHaveValue("");
	await expect
		.poll(() => rowLabels(page))
		.toEqual(expect.arrayContaining(["Launch plan", "2026-10-12", "Inbox"]));
	await settle(obsidian, page);
	await capture(page, "07-palette-mode-backlinks.png");

	// 8. Backspace in the empty input behaves like Esc.
	await input.press("Backspace");
	await expect(page.locator(CHIP)).toBeHidden();
	await expect(input).toHaveValue("b");
	await input.press("Escape");
	await page.locator(".my-palette-suggest-modal").waitFor({ state: "detached" });

	// 9. The note list has no Home rows.
	await runPaletteCommand(obsidian, "open-note-list");
	await input.waitFor();
	await expect(input).toHaveValue("");
	await expect(page.locator(".my-palette-section-heading")).toHaveCount(0);
	await expect.poll(() => rowLabels(page)).toEqual(expect.arrayContaining(["Meeting notes"]));
	await settle(obsidian, page);
	await capture(page, "08-palette-file-only.png");
});

// Each settings page opens in a fresh settings window, so the pages are captured one by one.
for (const [name, file, heading] of [
	["General", "09-settings-general.png", "Return to Home after"],
	["Modes", "10-settings-modes.png", "Search modes"],
	["File search", "11-settings-file-search.png", "File types"],
	["Shortcuts", "12-settings-shortcuts.png", "Palette and selector shortcuts"],
	["Integrations", "13-settings-integrations.png", "Integrations"],
] as const) {
	test(`capture the ${name} settings page`, async ({ obsidian }) => {
		await mkdir(outDir, { recursive: true });
		const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: name });
		await expect(settingsPage.locator(".setting-page-title").last()).toHaveText(name);
		await expect(settingsPage.getByText(heading, { exact: true }).last()).toBeVisible();
		await settle(obsidian, settingsPage);
		await capture(settingsPage, file);
		await obsidian.closeSettings();
	});
}
