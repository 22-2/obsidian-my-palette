import { expect, test } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	PLUGIN_ID,
	pluginVaultOptions,
	setIgnoreFilters,
	writeRaw,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

test("the i prefix finds notes hidden by Excluded files and opens them outside the vault", async ({
	obsidian,
}) => {
	await obsidian.waitReady();
	const page = obsidian.page;
	await writeRaw(page, "hidden-dir/Secret plan.md", "# Secret");
	await setIgnoreFilters(page, ["hidden-dir"]);
	// Obsidian cannot open `file:` markdown views in this harness, so record the
	// request instead and assert the plugin asks for the right absolute path.
	await page.evaluate((id) => {
		const plugin = (window as any).app.plugins.plugins[id];
		(window as any).__externalOpens = [];
		plugin.openExternalMarkdown = async (path: string) => {
			(window as any).__externalOpens.push(path);
		};
	}, PLUGIN_ID);

	await openPaletteWith(obsidian, "secret");
	await expect(page.locator(MODAL_ROW)).toHaveCount(0);

	await page.locator(MODAL_INPUT).fill("i secret");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Secret plan", {
		timeout: 15_000,
	});

	await page.keyboard.press("Enter");
	await expect
		.poll(() => page.evaluate(() => (window as any).__externalOpens))
		.toEqual([expect.stringMatching(/hidden-dir\/Secret plan\.md$/)]);
});

test("an ignored Markdown note opens as an external Markdown view", async ({ obsidian }) => {
	await obsidian.waitReady();
	const page = obsidian.page;
	await writeRaw(page, "hidden-dir/Secret plan.md", "# Secret");
	await setIgnoreFilters(page, ["hidden-dir"]);
	const supported = await page.evaluate(async () => {
		const app = (window as any).app;
		const leaf = app.workspace.getLeaf("tab");
		const file = `file:${app.vault.adapter.getFullPath("hidden-dir/Secret plan.md")}`;
		await leaf.setViewState({ type: "markdown", state: { file, mode: "source" } });
		const ok = leaf.view.getViewType() === "markdown";
		leaf.detach();
		return ok;
	});
	// Older Obsidian builds, such as the one bundled with the E2E toolkit, cannot
	// show files outside the vault; the feature is verified wherever they can.
	test.skip(!supported, "This Obsidian build cannot open external file: views.");

	await openPaletteWith(obsidian, "i secret");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Secret plan", {
		timeout: 15_000,
	});
	await page.keyboard.press("Enter");
	await expect
		.poll(() =>
			page.evaluate(() => {
				const leaf = (window as any).app.workspace.activeLeaf;
				return { type: leaf.view.getViewType(), file: leaf.view.getState().file };
			}),
		)
		.toEqual({ type: "markdown", file: expect.stringMatching(/^file:.*Secret plan\.md$/) });
});
