import { expect, test } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, MODAL_ROW, pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const MODAL = ".my-palette-suggest-modal";
const CHIP = ".my-palette-mode-chip";
const HEADING = ".my-palette-section-heading";

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await obsidian.createNote("Hub.md", "# Hub");
	await obsidian.createNote("Referrer.md", "points to [[Hub]]");
	await obsidian.open("Hub.md");
});

test("Root Search enters a mode with Enter and returns with Esc", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-root");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(`${MODAL} ${HEADING}`)).toHaveText(["Modes", "Files"]);

	await input.pressSequentially("esdir");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Search All Files in Vault");
	await input.press("Enter");
	await expect(page.locator(`${MODAL} ${CHIP}`)).toHaveText("esdir");
	await expect(input).toHaveValue("");
	await expect(page.locator(MODAL)).toHaveAttribute("data-everything-scope", "directory");

	// Esc goes back with the alias selected, so Enter would re-enter the mode.
	await input.press("Escape");
	await expect(page.locator(`${MODAL} ${CHIP}`)).toBeHidden();
	await expect(input).toHaveValue("esdir");
	expect(
		await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
	).toEqual([0, 5]);
	await expect(page.locator(MODAL_ROW).first()).toContainText("Search All Files in Vault");

	await input.press("Escape");
	await expect(page.locator(MODAL)).toHaveCount(0);
});

test("Tab enters a mode and Backspace in the empty input returns", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-root");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.pressSequentially("b");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Search Backlinks");
	await input.press("Tab");
	await expect(page.locator(`${MODAL} ${CHIP}`)).toHaveText("b");
	await expect(page.locator(MODAL_ROW)).toHaveText(/Referrer/);

	await input.press("Backspace");
	await expect(page.locator(`${MODAL} ${CHIP}`)).toBeHidden();
	await expect(input).toHaveValue("b");
});

test("alias plus Space enters the mode directly", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-root");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.pressSequentially("> link search");
	await expect(page.locator(`${MODAL} ${CHIP}`)).toHaveText(">");
	await expect(input).toHaveValue("link search");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Link search");
});

test("the file-only palette lists no modes", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open");
	const page = obsidian.page;
	await expect(page.locator(MODAL_ROW).first()).toBeVisible();
	await expect(page.locator(`${MODAL} ${HEADING}`)).toHaveCount(0);
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Run Command" })).toHaveCount(0);
});

test("a mode opened by its command returns to Root Search on Esc", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "backlink-search");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(`${MODAL} ${CHIP}`)).toHaveText("b");
	await expect(page.locator(MODAL_ROW)).toHaveText(/Referrer/);
	await input.press("Escape");
	await expect(page.locator(MODAL)).toHaveCount(1);
	await expect(input).toHaveValue("b");
	await expect(page.locator(`${MODAL} ${HEADING}`).first()).toHaveText("Modes");
});

test("the command list returns to Root Search on Esc", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-command-list");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(`${MODAL} ${CHIP}`)).toHaveText(">");
	await input.press("Escape");
	await expect(input).toHaveValue(">");
	await expect(page.locator(`${MODAL} ${HEADING}`).first()).toHaveText("Modes");
});

test("the sidebar keeps the mode as an alias in its saved input", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-view");
	const page = obsidian.page;
	const view = page.locator(".my-palette-view");
	const input = view.locator(".prompt-input");
	await input.fill("b ref");
	await expect(view.locator(CHIP)).toHaveText("b");
	await expect(input).toHaveValue("ref");
	await expect(view.locator(".suggestion-item")).toHaveText(/Referrer/);
	const saved = await obsidian.evaluateApp(() => {
		const [leaf] = app.workspace.getLeavesOfType("my-palette-search");
		return (leaf.view.getState() as { input?: string }).input;
	});
	expect(saved).toBe("b ref");

	await input.press("Escape");
	await expect(view.locator(CHIP)).toBeHidden();
	await expect(input).toHaveValue("b");
	await expect(view.locator(HEADING).first()).toHaveText("Modes");
});

test("the table lists no modes but still enters one by alias", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-table-view");
	const page = obsidian.page;
	const view = page.locator(
		'.workspace-leaf-content[data-type="my-palette-table"] .my-palette-view',
	);
	const input = view.locator(".prompt-input");
	await input.fill("b");
	await expect(view.getByText("Search Backlinks")).toHaveCount(0);
	await input.fill("b ");
	await expect(view.locator(CHIP)).toHaveText("b");
	await expect(view).toContainText("Referrer");
});
