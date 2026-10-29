import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, MODAL_ROW, pluginVaultOptions, runPaletteCommand } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("タグのチェックを取り消して閉じるとノートは変わらない", async ({ obsidian }) => {
	const content = "---\ntags:\n  - existing\n---\nbody\n";
	await obsidian.createNote("Target.md", content);
	await obsidian.open("Target.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-tag-insert-selector");
	const input = page.locator(MODAL_INPUT);
	await input.fill("new-tag");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#new-tag");
	await page.locator(`${MODAL_ROW} [data-row-toggle]`).first().click();
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);
	await input.press("Escape");
	await expect(page.locator(MODAL_INPUT)).toHaveCount(0);
	expect(await obsidian.read("Target.md")).toBe(content);
});

test("絞り込みをまたいで既存タグを外し新しいタグを追加する", async ({ obsidian }) => {
	await obsidian.createNote("Target.md", "---\ntags:\n  - existing\n  - keep\n---\nbody\n");
	await obsidian.open("Target.md");
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					app.metadataCache.getFileCache(app.vault.getFileByPath("Target.md")!)
						?.frontmatter?.tags,
			),
		)
		.toEqual(["existing", "keep"]);
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-tag-insert-selector");
	const input = page.locator(MODAL_INPUT);
	await input.fill("existing");
	const existing = page.locator(MODAL_ROW).filter({ hasText: "#existing" });
	await expect(existing).toHaveClass(/is-checked/);
	await existing.locator("[data-row-toggle]").click();
	await expect(existing).not.toHaveClass(/is-checked/);
	await input.press("f");
	await input.fill("brand-new");
	const newTag = page.locator(MODAL_ROW).filter({ hasText: "#brand-new" });
	await expect(newTag).toBeVisible();
	await newTag.locator("[data-row-toggle]").click();
	await expect(page.locator(".my-palette-checked-button__count")).toContainText("+1");
	await expect(page.locator(".my-palette-checked-button__count")).toContainText("−1");
	await input.press("Control+Enter");
	await expect.poll(() => obsidian.read("Target.md")).toContain("brand-new");
	const result = await obsidian.read("Target.md");
	expect(result).toContain("keep");
	expect(result).not.toContain("existing");
});

test("フォルダー選択をキャンセルし、再度開いて別フォルダーに移動する", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "body");
	await obsidian.createNote("Destination/Other.md", "other");
	await obsidian.open("Source.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-folder-move-selector");
	await page.locator(MODAL_INPUT).fill("Destination");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Destination");
	await page.locator(MODAL_INPUT).press("Escape");
	expect(await obsidian.read("Source.md")).toBe("body");
	await runPaletteCommand(obsidian, "open-folder-move-selector");
	await page.locator(MODAL_INPUT).fill("Destination");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Destination");
	await page.locator(MODAL_INPUT).press("Enter");
	await expect.poll(() => obsidian.read("Destination/Source.md")).toBe("body");
});

test("多数の候補でもチェックを維持し、別の検索からまとめて適用する", async ({ obsidian }) => {
	const tags = Array.from(
		{ length: 65 },
		(_, index) => `sample${String(index).padStart(3, "0")}`,
	);
	await obsidian.createNote("Tagged.md", tags.map((tag) => `#${tag}`).join(" "));
	await obsidian.createNote("Target.md", "target");
	await obsidian.open("Target.md");
	await expect
		.poll(() => obsidian.evaluateApp(() => Object.keys(app.metadataCache.getTags()).length))
		.toBeGreaterThanOrEqual(65);
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-tag-insert-selector");
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(MODAL_ROW)).toHaveCount(50);
	await input.fill("sample000");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#sample000");
	await page.locator(`${MODAL_ROW} [data-row-toggle]`).first().click();
	await input.press("f");
	await input.fill("sample064");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#sample000");
	await expect(page.locator(MODAL_ROW).nth(1)).toContainText("#sample064");
	await page.locator(`${MODAL_ROW} [data-row-toggle]`).nth(1).click();
	await input.press("Control+Enter");
	await expect.poll(() => obsidian.read("Target.md")).toContain("sample064");
	expect(await obsidian.read("Target.md")).toContain("sample000");
});

test("移動先で同名が衝突しても元を保ち、別の移動先を選び直せる", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "original");
	await obsidian.createNote("Blocked/Source.md", "existing");
	await obsidian.createNote("Available/Other.md", "other");
	await obsidian.open("Source.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-folder-move-selector");
	const input = page.locator(MODAL_INPUT);
	await input.fill("Blocked");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Blocked");
	await input.press("Enter");
	await expect(input).toBeVisible();
	await expect(page.locator(".notice")).toContainText("Source.md");
	expect(await obsidian.read("Source.md")).toBe("original");
	expect(await obsidian.read("Blocked/Source.md")).toBe("existing");
	await input.fill("Available");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Available");
	await input.press("Enter");
	await expect.poll(() => obsidian.read("Available/Source.md")).toBe("original");
});

test("マージの確認画面を閉じると両方のノートが残る", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "source body");
	await obsidian.createNote("Target.md", "target body");
	await obsidian.open("Source.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-merge-selector");
	const input = page.locator(MODAL_INPUT);
	await input.fill("Target");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Target");
	await input.press("Control+Enter");
	await expect(page.locator(MODAL_INPUT)).toHaveAttribute(
		"placeholder",
		"Ctrl+Enter で実行します",
	);
	await page.keyboard.press("Escape");
	await expect(page.locator(MODAL_INPUT)).toHaveCount(0);
	expect(await obsidian.read("Source.md")).toBe("source body");
	expect(await obsidian.read("Target.md")).toBe("target body");
});
