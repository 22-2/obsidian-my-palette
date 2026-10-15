import { expect, test } from "./fixtures.mts";
import {
	IGNORED_OPTION,
	flipOption,
	optionState,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	setIgnoreFilters,
	writeRaw,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await writeRaw(obsidian, "hidden-dir/Secret plan.md", "# Secret");
	await setIgnoreFilters(obsidian, ["hidden-dir"]);
});

test("the Obsidian-excluded option finds notes hidden by Excluded files", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "secret");
	await expect(page.locator(MODAL_ROW)).toHaveCount(0);

	await flipOption(page, IGNORED_OPTION);
	expect(await optionState(page, IGNORED_OPTION)).toBe("on");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Secret plan", {
		timeout: 15_000,
	});
	await expect(page.locator(MODAL_INPUT)).toBeFocused();

	// Other modes never search Obsidian-excluded files, so the option is not offered there.
	await page.locator(MODAL_INPUT).press("Escape");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveAttribute("data-route", "home");
	await page.locator(MODAL_INPUT).fill("> secret");
	await expect(page.locator(".my-palette-mode-chip")).toHaveText(">");
	expect(await optionState(page, IGNORED_OPTION)).toBe("hidden");
});

test("the Obsidian-excluded option searches excluded notes by keywords", async ({ obsidian }) => {
	await writeRaw(
		obsidian,
		"hidden-dir/Observations.md",
		"---\nkeywords:\n  - 宇宙\n  - 星空観察\n---\n# Observations",
	);
	const page = await openPaletteWith(obsidian, "宇宙 星空");
	await flipOption(page, IGNORED_OPTION);
	await expect(page.locator(MODAL_ROW)).toHaveCount(1, { timeout: 15_000 });
	await expect(page.locator(MODAL_ROW).first()).toContainText("Observations");
	await expect(page.locator(`${MODAL_ROW} .my-palette-suggestion__tag`)).toHaveText([
		"宇宙",
		"星空観察",
	]);
});

test("Enter opens an Obsidian-excluded Markdown file as an external Markdown view", async ({
	obsidian,
}) => {
	const page = await openPaletteWith(obsidian, "secret");
	await flipOption(page, IGNORED_OPTION);
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
