import { expect, test } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	setIgnoreFilters,
	writeRaw,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await writeRaw(obsidian, "hidden-dir/Secret plan.md", "# Secret");
	await setIgnoreFilters(obsidian, ["hidden-dir"]);
});

test("the i prefix finds notes hidden by Excluded files", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "secret");
	await expect(page.locator(MODAL_ROW)).toHaveCount(0);

	await page.locator(MODAL_INPUT).fill("i secret");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Secret plan", {
		timeout: 15_000,
	});
});

test("the i prefix searches excluded notes by keywords", async ({ obsidian }) => {
	await writeRaw(
		obsidian,
		"hidden-dir/Observations.md",
		"---\nkeywords:\n  - 宇宙\n  - 星空観察\n---\n# Observations",
	);
	const page = await openPaletteWith(obsidian, "i 宇宙 星空");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1, { timeout: 15_000 });
	await expect(page.locator(MODAL_ROW).first()).toContainText("Observations");
	await expect(page.locator(`${MODAL_ROW} .my-palette-suggestion__tag`)).toHaveText([
		"宇宙",
		"星空観察",
	]);
});

test("Enter opens an ignored Markdown note as an external Markdown view", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "i secret");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Secret plan", {
		timeout: 15_000,
	});
	await page.keyboard.press("Enter");
	await expect
		.poll(() =>
			obsidian.evaluateApp(() => {
				const leaf = app.workspace.getMostRecentLeaf();
				const state = leaf?.view.getState() as { file?: string } | undefined;
				return { type: leaf?.view.getViewType(), file: state?.file };
			}),
		)
		.toEqual({ type: "markdown", file: expect.stringMatching(/^file:.*Secret plan\.md$/) });
	// Reading the same note back proves the source was left untouched.
	expect(await obsidian.read("hidden-dir/Secret plan.md")).toBe("# Secret");
});
