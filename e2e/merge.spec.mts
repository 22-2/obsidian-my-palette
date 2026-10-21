import { expect, test } from "./fixtures.mts";
import {
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("opens the target note after merging from the command", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "source body");
	await obsidian.createNote("Target.md", "target body");
	await obsidian.open("Source.md");
	const page = obsidian.page;

	await runPaletteCommand(obsidian, "open-merge-selector");
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill("Target");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Target");
	await page.keyboard.press("Control+Enter");

	await expect(page.locator(MODAL_INPUT)).toHaveAttribute(
		"placeholder",
		"Ctrl+Enter で実行します",
	);
	await page.keyboard.press("Control+Enter");

	await expect.poll(() => obsidian.read("Target.md")).toContain("source body");
	await expect
		.poll(async () => (await obsidian.allTabs()).some((tab) => tab.filePath === "Target.md"))
		.toBe(true);
	expect((await obsidian.activeTab())?.filePath).toBe("Target.md");
});

test("opens the target note after merging from the palette", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "source body");
	await obsidian.createNote("Target.md", "target body");
	// 統合元を開いたままにしない。開いたままゴミ箱へ移すと Obsidian が別のノートを
	// 自動で開くことがあり、マージ先を開いたのか区別できなくなる。
	await obsidian.createNote("Current.md", "current body");
	await obsidian.open("Current.md");
	const page = await openPaletteWith(obsidian, "Source");

	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await page.locator(".menu .menu-item").filter({ hasText: "マージ…" }).click();
	await page.locator(MODAL_INPUT).last().fill("Target");
	await expect(page.locator(MODAL_ROW).last()).toContainText("Target");
	await page.keyboard.press("Control+Enter");

	await expect(page.locator(MODAL_INPUT).last()).toHaveAttribute(
		"placeholder",
		"Ctrl+Enter で実行します",
	);
	await page.keyboard.press("Control+Enter");

	await expect.poll(() => obsidian.read("Target.md")).toContain("source body");
	await expect
		.poll(async () => (await obsidian.allTabs()).some((tab) => tab.filePath === "Target.md"))
		.toBe(true);
	expect((await obsidian.activeTab())?.filePath).toBe("Target.md");
});
