import { expect, test } from "./fixtures.mts";
import { pluginVaultOptions, runPaletteCommand } from "./support.mts";
import type { ObsidianAPI } from "./fixtures.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const ROW = ".my-palette-view .suggestion-item";

async function openSidebarPalette(obsidian: ObsidianAPI): Promise<void> {
	for (const name of ["Alpha", "Beta", "Gamma"])
		await obsidian.createNote(`${name}.md`, `# ${name}`);
	await obsidian.open("Alpha.md");
	await runPaletteCommand(obsidian, "open-sidebar-palette");
	await obsidian.page.locator(ROW).first().waitFor();
}

function activePath(obsidian: ObsidianAPI): Promise<string | undefined> {
	return obsidian.evaluateApp(() => app.workspace.getActiveFile()?.path);
}

/** ファイル一覧の再検索(Vault やメタデータの変更で走る)を起こし、描画し直されるのを待つ。 */
async function refreshResults(obsidian: ObsidianAPI): Promise<void> {
	await obsidian.evaluateApp(() => {
		app.metadataCache.trigger("resolved");
	});
	await obsidian.page.waitForTimeout(900);
}

test("sidebar double click opens the note even if the list is re-rendered during the second press", async ({
	obsidian,
}) => {
	await openSidebarPalette(obsidian);
	const page = obsidian.page;
	const box = await page.locator(ROW).filter({ hasText: "Gamma" }).first().boundingBox();
	if (!box) throw new Error("no Gamma row");
	await page.mouse.move(box.x + 40, box.y + box.height / 2);
	await page.mouse.down({ clickCount: 1 });
	await page.mouse.up({ clickCount: 1 });
	await page.mouse.down({ clickCount: 2 });
	await refreshResults(obsidian);
	await page.mouse.up({ clickCount: 2 });
	await expect.poll(() => activePath(obsidian)).toBe("Gamma.md");
});

test("sidebar double click opens the note only once", async ({ obsidian }) => {
	await openSidebarPalette(obsidian);
	const page = obsidian.page;
	await page.locator(ROW).filter({ hasText: "Beta" }).first().dblclick();
	await expect.poll(() => activePath(obsidian)).toBe("Beta.md");
	const tabs = await page.locator(".mod-root .workspace-tab-header").count();
	expect(tabs).toBe(1);
});

test("sidebar middle click brings the already open note's tab to the front", async ({
	obsidian,
}) => {
	await openSidebarPalette(obsidian);
	const page = obsidian.page;
	await page.locator(ROW).filter({ hasText: "Beta" }).first().click({ button: "middle" });
	const tabs = page.locator(".mod-root .workspace-tab-header");
	await expect(tabs).toHaveCount(2);
	await expect(tabs.filter({ hasText: "Beta" })).toHaveClass(/is-active/);
	await page.locator(ROW).filter({ hasText: "Alpha" }).first().click({ button: "middle" });
	await expect(tabs.filter({ hasText: "Alpha" })).toHaveClass(/is-active/);
	await expect(tabs).toHaveCount(2);
});
