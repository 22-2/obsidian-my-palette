import { expect, test } from "obsidian-e2e-toolkit";
import { MODAL_ROW, openPaletteWith, pluginVaultOptions, rowLabels } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await obsidian.createNote("Projects/Alpha plan.md", "# Alpha");
	await obsidian.createNote("Projects/Beta notes.md", "# Beta");
});

test("file search ranks the matching note first", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "alpha");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	expect(await rowLabels(page)).toEqual(["Alpha plan"]);
	await expect(page.locator(MODAL_ROW).first()).toContainText("Projects/Alpha plan.md");
});

test("keywords find a note and explain the hit in chips", async ({ obsidian }, testInfo) => {
	await obsidian.createNote(
		"Projects/Observations.md",
		"---\nkeywords: [宇宙, 星空観察, 宇宙探査, 宇宙旅行]\n---\n# Observations",
	);
	await expect
		.poll(async () =>
			obsidian.evaluateApp(
				() =>
					app.metadataCache.getFileCache(
						app.vault.getFileByPath("Projects/Observations.md")!,
					)?.frontmatter?.keywords,
			),
		)
		.toEqual(["宇宙", "星空観察", "宇宙探査", "宇宙旅行"]);
	const page = await openPaletteWith(obsidian, "宇宙 | 星空");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	expect(await rowLabels(page)).toEqual(["Observations"]);
	await expect(page.locator(`${MODAL_ROW} .my-palette-suggestion__tag`)).toHaveText([
		"宇宙",
		"星空観察",
		"宇宙探査",
		"+1",
	]);
	await expect(page.locator(`${MODAL_ROW} .my-palette-suggestion__tags`)).toHaveAttribute(
		"title",
		"Keywords: 宇宙, 星空観察, 宇宙探査, 宇宙旅行",
	);
	await page.screenshot({ path: testInfo.outputPath("keywords.png") });
});

test("Enter opens the selected note in the editor", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "beta");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Beta notes");
	await page.keyboard.press("Enter");
	await expect
		.poll(async () => (await obsidian.activeTab())?.filePath)
		.toBe("Projects/Beta notes.md");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveCount(0);
});
