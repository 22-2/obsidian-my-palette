import { expect, test } from "obsidian-e2e-toolkit";
import {
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
});

test("a result can be inserted into the active note's MOC Relateds", async ({ obsidian }) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n## Body\ntext\n");
	await obsidian.createNote("Child note.md", "child");
	await obsidian.open("Topic MOC.md");

	const page = await openPaletteWith(obsidian, "child");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Child note");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "Insert into MOC Relateds" }).click();

	await expect
		.poll(() => obsidian.read("Topic MOC.md"))
		.toMatch(/- Relateds\n\s+- \[\[Child note\]\]/);
});

test("several tags can be checked and inserted into the note together", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "# Tagged\n");
	await obsidian.open("Tagged.md");
	const page = obsidian.page;

	await runPaletteCommand(obsidian, "insert-tags");
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill("alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#alpha");
	await page.keyboard.press("Enter");
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);

	await page.locator(MODAL_INPUT).fill("beta");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#beta");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Control+Enter");

	await expect
		.poll(async () => {
			const content = await obsidian.read("Tagged.md");
			return ["alpha", "beta"].every((tag) => content.includes(tag));
		})
		.toBe(true);
});
