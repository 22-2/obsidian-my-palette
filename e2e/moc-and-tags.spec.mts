import { expect, test } from "obsidian-e2e-toolkit";
import {
	createNote,
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openNote,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
});

async function read(page: import("@playwright/test").Page, path: string): Promise<string> {
	return page.evaluate(
		(path) => (window as any).app.vault.adapter.read(path) as Promise<string>,
		path,
	);
}

test("a result can be inserted into the active note's MOC Relateds", async ({ obsidian }) => {
	const page = obsidian.page;
	await createNote(page, "Topic MOC.md", "## MOC\n- Relateds\n\n## Body\ntext\n");
	await createNote(page, "Child note.md", "child");
	await openNote(page, "Topic MOC.md");

	await openPaletteWith(obsidian, "child");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Child note");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "Insert into MOC Relateds" }).click();

	await expect
		.poll(() => read(page, "Topic MOC.md"))
		.toMatch(/- Relateds\n\s+- \[\[Child note\]\]/);
});

test("several tags can be checked and inserted into the note together", async ({ obsidian }) => {
	const page = obsidian.page;
	await createNote(page, "Tagged.md", "# Tagged\n");
	await openNote(page, "Tagged.md");

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
			const content = await read(page, "Tagged.md");
			return ["alpha", "beta"].every((tag) => content.includes(tag));
		})
		.toBe(true);
});
