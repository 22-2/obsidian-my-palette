import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, MODAL_ROW, openHomeWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const NOTE = "Plan.md";
// 見出しは 0 行目・4 行目・7 行目にある。
const CONTENT = ["# Overview", "", "intro", "", "## Details", "body", "", "### Next steps"].join(
	"\n",
);

test("h lists the headings of the active note with their levels", async ({ obsidian }) => {
	await obsidian.createNote(NOTE, CONTENT);
	await obsidian.open(NOTE);
	const page = await openHomeWith(obsidian, "h ");
	const rows = page.locator(MODAL_ROW);
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText("Overview");
	await expect(rows.nth(0).locator(".my-palette-suggestion__badge")).toHaveText("H1");
	await expect(rows.nth(1)).toContainText("Details");
	await expect(rows.nth(1).locator(".my-palette-suggestion__badge")).toHaveText("H2");
	await expect(rows.nth(2).locator(".my-palette-suggestion__badge")).toHaveText("H3");
});

test("Enter moves the cursor to the heading and highlights its line", async ({ obsidian }) => {
	await obsidian.createNote(NOTE, CONTENT);
	await obsidian.open(NOTE);
	// 検索の一致の強調を記録する。Obsidian の内部 API なので、呼び出しを横から確かめる。
	await obsidian.evaluateApp(() => {
		const editMode = (
			app.workspace.activeEditor as unknown as {
				editMode: { highlightSearchMatches: (ranges: unknown) => void };
			}
		).editMode;
		const original = editMode.highlightSearchMatches;
		editMode.highlightSearchMatches = (ranges) => {
			(window as unknown as { highlighted?: unknown }).highlighted = ranges;
			original.call(editMode, ranges);
		};
	});

	const page = await openHomeWith(obsidian, "h Details");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	await page.locator(MODAL_INPUT).press("Enter");
	await expect(page.locator(MODAL_ROW)).toHaveCount(0);

	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() => app.workspace.activeEditor?.editor?.getCursor().line ?? null,
			),
		)
		.toBe(4);
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() => (window as unknown as { highlighted?: unknown }).highlighted,
			),
		)
		.toEqual([{ from: { line: 4, ch: 0 }, to: { line: 4, ch: 10 } }]);
});
