import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import { MODAL_ROW, openPaletteWith, pluginVaultOptions, t } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const NOTE = "Submenu note.md";

test.beforeEach(async ({ obsidian }) => {
	await obsidian.createNote(NOTE, "本文");
});

/** ノートの行を右クリックして、結果のメニューを開く。 */
async function openResultMenu(obsidian: ObsidianAPI): Promise<Page> {
	const page = await openPaletteWith(obsidian, "Submenu note");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Submenu note");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await page.locator(".menu").waitFor();
	return page;
}

/** メニューの中の、タイトルが一致する項目。サブメニューを持つ項目と、その中の項目の両方を探せる。 */
function item(page: Page, title: string): Locator {
	return page.locator(".menu .menu-item").filter({ hasText: title });
}

/** 絞り込みで隠れていない項目の、タイトルの並び。 */
function visibleTitles(page: Page): Locator {
	return page.locator(".menu .menu-item:not(.is-filtered) .menu-item-title");
}

async function readClipboard(obsidian: ObsidianAPI): Promise<string> {
	return obsidian.evaluateApp(() => navigator.clipboard.readText());
}

test("外部アプリとパスのコピーは、サブメニューに畳まれ、クリックで開く", async ({ obsidian }) => {
	const page = await openResultMenu(obsidian);

	await expect(item(page, t("menu.copyPath"))).toHaveClass(/has-submenu/);
	await expect(item(page, t("menu.externalApps"))).toHaveClass(/has-submenu/);
	await expect(item(page, t("menu.copyRelativePath"))).toHaveCount(0);

	await item(page, t("menu.copyPath")).click();
	await expect(page.locator(".menu")).toHaveCount(2);
	await expect(page.locator(".menu").nth(1).locator(".menu-item-title")).toHaveText([
		t("menu.copyFileName"),
		t("menu.copyRelativePath"),
		t("menu.copyAbsolutePath"),
	]);
});

test("サブメニューは親メニューの右に、持ち主の項目と最初の項目の高さを揃えて開く", async ({
	obsidian,
}) => {
	const page = await openResultMenu(obsidian);
	await item(page, t("menu.copyPath")).click();
	await expect(page.locator(".menu")).toHaveCount(2);

	const owner = await item(page, t("menu.copyPath")).first().boundingBox();
	const parent = await page.locator(".menu").first().boundingBox();
	const child = await page.locator(".menu").nth(1).boundingBox();
	const first = await page.locator(".menu").nth(1).locator(".menu-item").first().boundingBox();
	if (!owner || !parent || !child || !first) throw new Error("メニューの位置を取得できない");

	// 親の右端に、重なる幅(2px)だけ食い込んで並ぶ。
	expect(child.x).toBeGreaterThanOrEqual(parent.x + parent.width - 4);
	expect(child.x).toBeLessThanOrEqual(parent.x + parent.width);
	// 最初の項目が、持ち主の項目と同じ高さに並ぶ。
	expect(Math.abs(first.y - owner.y)).toBeLessThanOrEqual(2);
});

test("ポインターを乗せると開き、別の項目へ動かすと閉じる", async ({ obsidian }) => {
	const page = await openResultMenu(obsidian);

	await item(page, t("menu.externalApps")).hover();
	await expect(page.locator(".menu")).toHaveCount(2);
	await expect(item(page, t("menu.openInTerminal"))).toBeVisible();

	await item(page, t("menu.copyPath")).hover();
	// 外部アプリのサブメニューが閉じ、パスのコピーのサブメニューが開く。
	await expect(item(page, t("menu.openInTerminal"))).toHaveCount(0);
	await expect(item(page, t("menu.copyRelativePath"))).toBeVisible();
	await expect(page.locator(".menu")).toHaveCount(2);
});

test("アクセスキーで開き、Esc は1段ずつ閉じ、中のアクセスキーで実行する", async ({ obsidian }) => {
	const page = await openResultMenu(obsidian);

	// 絞り込みの欄に打つ入力モードから、↓ で選択モードに入ると、アクセスキーが効く。
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("c");
	await expect(page.locator(".menu")).toHaveCount(2);

	await page.keyboard.press("Escape");
	await expect(page.locator(".menu")).toHaveCount(1);
	await page.keyboard.press("c");
	await expect(page.locator(".menu")).toHaveCount(2);

	await page.keyboard.press("p");
	await expect(page.locator(".menu")).toHaveCount(0);
	await expect.poll(() => readClipboard(obsidian)).toBe(NOTE);
});

test("矢印キーで、サブメニューへ入り、持ち主の項目へ戻る", async ({ obsidian }) => {
	const page = await openResultMenu(obsidian);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("c");
	await expect(page.locator(".menu")).toHaveCount(2);
	await expect(page.locator(".menu").nth(1).locator(".menu-item.selected")).toContainText(
		t("menu.copyFileName"),
	);

	await page.keyboard.press("ArrowDown");
	await expect(page.locator(".menu").nth(1).locator(".menu-item.selected")).toContainText(
		t("menu.copyRelativePath"),
	);

	await page.keyboard.press("ArrowLeft");
	await expect(page.locator(".menu")).toHaveCount(1);
	await expect(page.locator(".menu .menu-item.selected")).toContainText(t("menu.copyPath"));
});

test("絞り込むと、サブメニューの中の操作が一覧に並び、消すと畳まれた姿へ戻る", async ({
	obsidian,
}) => {
	const page = await openResultMenu(obsidian);
	const input = page.locator(".my-palette-menu-filter__input");

	await input.fill("ターミナル");
	await expect(visibleTitles(page)).toHaveText([t("menu.openInTerminal")]);
	await expect(page.locator(".menu")).toHaveCount(1);

	await input.fill("");
	await expect(item(page, t("menu.externalApps"))).toBeVisible();
	await expect(item(page, t("menu.openInTerminal"))).toHaveCount(0);

	// 元のサブメニューへ戻っているので、開くと3つとも揃っている。
	await item(page, t("menu.externalApps")).click();
	await expect(page.locator(".menu").nth(1).locator(".menu-item-title")).toHaveText([
		t("menu.openInExternalEditor"),
		t("menu.revealInSystemExplorer"),
		t("menu.openInTerminal"),
	]);
});

test("サブメニューの外を押すとメニュー全体が閉じる", async ({ obsidian }) => {
	const page = await openResultMenu(obsidian);
	await item(page, t("menu.copyPath")).click();
	await expect(page.locator(".menu")).toHaveCount(2);

	// サブメニューの中の押下では閉じない。項目ではなく、メニューの余白を押す。
	await page
		.locator(".menu")
		.nth(1)
		.click({ position: { x: 2, y: 2 } });
	await expect(page.locator(".menu")).toHaveCount(2);

	await page.locator(".modal-bg").click({ position: { x: 5, y: 5 } });
	await expect(page.locator(".menu")).toHaveCount(0);
});
