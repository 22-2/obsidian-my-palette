import { expect, test } from "obsidian-e2e-toolkit";
import { pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

for (const [surface, command, selector] of [
	["modal", "open", ".my-palette-suggest-modal"],
	[
		"sidebar",
		"open-view",
		'.workspace-leaf-content[data-type="my-palette-search"] .my-palette-view',
	],
	[
		"table",
		"open-table-view",
		'.workspace-leaf-content[data-type="my-palette-table"] .my-palette-view',
	],
] as const) {
	test(`Alt+H fades the ${surface} in every search mode`, async ({ obsidian }, testInfo) => {
		await obsidian.waitReady();
		await obsidian.createNote("Alpha.md", "# Alpha");
		await obsidian.open("Alpha.md");
		await runPaletteCommand(obsidian, command);
		const page = obsidian.page;
		const panel = page.locator(selector);
		const container = surface === "modal" ? page.locator(".my-palette-modal-container") : panel;
		const input = panel.locator(".prompt-input");
		await expect(input).toBeVisible();
		for (const [query, mode] of [
			["alpha", "file"],
			["> link", "command"],
			["o alpha", "link"],
			["b alpha", "backlink"],
			["bk alpha", "bookmark"],
			["sc alpha", "smart"],
			["e alpha", "everything"],
			["esdir alpha", "everything"],
			["i alpha", "file"],
		] as const) {
			await input.fill(query);
			await expect(panel).toHaveAttribute("data-mode", mode);
			const bounds = await container.boundingBox();
			await page.keyboard.down("Alt");
			await page.keyboard.down("h");
			await expect(container).toHaveClass(/is-preview-hidden/);
			await expect(container).toHaveCSS("transition-duration", "0.14s, 0s");
			await expect(container).toBeHidden();
			await expect(container).toHaveCSS("opacity", "0");
			expect(await container.boundingBox()).toEqual(bounds);
			// Alternate which key restores the surface, then release the other key.
			await page.keyboard.up(query.startsWith("b") ? "Alt" : "h");
			await expect(container).toBeVisible();
			await expect(container).toHaveCSS("opacity", "1");
			await expect(input).toBeFocused();
			await expect(input).toHaveValue(query);
			await page.keyboard.up("h");
			await page.keyboard.up("Alt");
		}
		await input.fill("alpha");
		await page.keyboard.down("Alt");
		await page.keyboard.down("h");
		await page.keyboard.up("h");
		await page.keyboard.up("Alt");
		await expect(container).toBeVisible();
		await expect(container).toHaveCSS("opacity", "1");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.keyboard.down("Alt");
		await page.keyboard.down("h");
		await expect(container).toHaveCSS("transition-duration", "0.04s, 0s");
		await expect(container).toBeHidden();
		await page.keyboard.up("h");
		await page.keyboard.up("Alt");
		await expect(container).toHaveCSS("opacity", "1");
		await expect(input).toBeFocused();
		await page.screenshot({ path: testInfo.outputPath(`${surface}-restored.png`) });
	});
}
