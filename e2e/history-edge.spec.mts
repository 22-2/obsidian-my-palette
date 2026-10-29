import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, MODAL_ROW, openPaletteWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("履歴を複数保存し、結果がない短いパレットから最後の履歴を選ぶ", async ({ obsidian }) => {
	await obsidian.createNote("Alpha plan.md", "# Alpha");
	const page = await openPaletteWith(obsidian, "alpha");
	const input = page.locator(MODAL_INPUT);
	for (const query of ["alpha", "alph", "alp", "al", "a"]) {
		await input.fill(query);
		await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha plan");
		await input.press("ArrowDown");
	}
	await input.fill("存在しない検索語".repeat(20));
	await expect(page.locator(".suggestion-empty")).toBeVisible();
	await input.press("Control+r");
	const history = page.locator(".my-palette-history-suggest");
	await expect(history).toBeVisible();
	const oldest = history.getByText("alpha", { exact: true });
	await expect(oldest).toBeVisible();
	const hit = await oldest.evaluate((el) => {
		const rect = el.getBoundingClientRect();
		return el.contains(document.elementFromPoint(rect.left + 12, rect.top + rect.height / 2));
	});
	expect(hit).toBe(true);
	await oldest.click();
	await expect(input).toHaveValue("alpha");
});

test("大量の履歴をキーボードで末尾まで移動して復元する", async ({ obsidian }) => {
	const name = "abcdefghijklmnopqrstuvwx";
	await obsidian.createNote(`${name}.md`, "# Note");
	const page = await openPaletteWith(obsidian, "");
	const input = page.locator(MODAL_INPUT);
	for (let length = 1; length <= 18; length++) {
		await input.fill(name.slice(0, length));
		await expect(page.locator(MODAL_ROW).first()).toContainText(name);
		await input.press("ArrowDown");
	}
	await input.fill("一致しない".repeat(80));
	await input.press("Control+r");
	const history = page.locator(".my-palette-history-suggest");
	await expect(history.locator('[role="option"]')).toHaveCount(18);
	await input.press("ArrowUp");
	const selected = history.locator('[aria-selected="true"]');
	await expect(selected).toHaveText("a");
	expect(
		await selected.evaluate((el) => {
			const row = el.getBoundingClientRect();
			const list = el.parentElement!.getBoundingClientRect();
			return (
				row.top >= list.top &&
				row.bottom <= list.bottom &&
				el.contains(document.elementFromPoint(row.left + 12, row.top + row.height / 2))
			);
		}),
	).toBe(true);
	await input.press("Enter");
	await expect(input).toHaveValue("a");
	await expect(history).toBeHidden();
});

test("狭いパレットでも長い履歴を表示して復元する", async ({ obsidian }, testInfo) => {
	const name = "非常に長い日本語の検索履歴を確認するためのノート";
	await obsidian.createNote(`${name}.md`, "# Note");
	const page = await openPaletteWith(obsidian, name);
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(MODAL_ROW).first()).toContainText(name);
	await input.press("ArrowDown");
	await input.fill("一致しない");
	await page.locator(".my-palette-suggest-modal").evaluate((el: HTMLElement) => {
		el.style.width = "240px";
	});
	await input.press("Control+r");
	const history = page.locator(".my-palette-history-suggest");
	const item = history.locator('[role="option"]').first();
	await expect(item).toContainText(name);
	expect(
		await item.evaluate((el) => {
			const rect = el.getBoundingClientRect();
			return el.contains(
				document.elementFromPoint(rect.left + 12, rect.top + rect.height / 2),
			);
		}),
	).toBe(true);
	await page.screenshot({ path: testInfo.outputPath("narrow-history.png") });
	await item.click();
	await expect(input).toHaveValue(name);
});
