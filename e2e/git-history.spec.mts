import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures.mts";
import { menuItems, openHomeWith, pluginVaultOptions, t } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("opens committed content and copies a link to a deleted file", async ({ obsidian }) => {
	await obsidian.createNote("過去のメモ.md", "昔の本文\n");
	const root = await obsidian.evaluateApp(() =>
		(app.vault.adapter as unknown as { getBasePath(): string }).getBasePath(),
	);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true });
	git("init");
	git("config", "user.name", "Tester");
	git("config", "user.email", "test@example.com");
	git("remote", "add", "origin", "https://github.com/example/repo.git");
	git("add", "--", "過去のメモ.md");
	git("commit", "-m", "追加");
	const parent = git("rev-parse", "HEAD").toString().trim();
	git("rm", "--", "過去のメモ.md");
	git("commit", "-m", "削除しました");
	const page = await openHomeWith(obsidian, "git ");
	const palette = page.locator(".my-palette-suggest-modal").first();
	const commit = palette.locator(".suggestion-item").filter({ hasText: "削除しました" });
	await expect(commit).toBeVisible();
	await commit.click();
	await page.keyboard.press("Enter");
	const changes = page.locator(".my-palette-suggest-modal").last();
	const file = changes.locator(".suggestion-item").filter({ hasText: "過去のメモ.md" });
	await expect(file).toContainText("D");
	await file.click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("git.copyGithub") })
		.click();
	await expect
		.poll(() => obsidian.evaluateApp(() => navigator.clipboard.readText()))
		.toContain(`https://github.com/example/repo/blob/${parent}/`);
	await file.click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("git.copyObsidian") })
		.click();
	await expect
		.poll(() => obsidian.evaluateApp(() => navigator.clipboard.readText()))
		.toContain("obsidian://my-palette-git?");
	const copied = await obsidian.evaluateApp(() => navigator.clipboard.readText());
	const uri = new URL(copied);
	expect(uri.searchParams.get("commit")).toBe(parent);
	expect(uri.searchParams.get("path")).toBe("過去のメモ.md");
	await file.click();
	await page.keyboard.press("Enter");
	const content = page.locator(".my-palette-git-version .cm-content");
	await expect(content).toContainText("昔の本文");
	await content.click();
	await page.keyboard.type("変更");
	await expect(content).not.toContainText("変更");
});

test("compares committed versions side by side without editing either", async ({ obsidian }) => {
	await obsidian.createNote("比較.md", "変更前\n");
	const root = await obsidian.evaluateApp(() =>
		(app.vault.adapter as unknown as { getBasePath(): string }).getBasePath(),
	);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true });
	git("init");
	git("config", "user.name", "Tester");
	git("config", "user.email", "test@example.com");
	git("add", "--", "比較.md");
	git("commit", "-m", "最初");
	await obsidian.createNote("比較.md", "変更後\n");
	git("add", "--", "比較.md");
	git("commit", "-m", "更新");
	const page = await openHomeWith(obsidian, "git ");
	const commit = page
		.locator(".my-palette-suggest-modal")
		.first()
		.locator(".suggestion-item")
		.filter({ hasText: "更新" });
	await expect(commit).toBeVisible();
	await commit.dblclick();
	const file = page
		.locator(".my-palette-suggest-modal")
		.last()
		.locator(".suggestion-item")
		.filter({ hasText: "比較.md" });
	await file.click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("git.diff") })
		.click();
	const diff = page.locator(".my-palette-git-diff");
	const before = diff.locator(".cm-merge-a .cm-content");
	const after = diff.locator(".cm-merge-b .cm-content");
	await expect(before).toContainText("変更前");
	await expect(after).toContainText("変更後");
	await expect(diff.locator(".cm-merge-a .cm-changedLine")).toHaveCount(1);
	await expect(diff.locator(".cm-merge-b .cm-changedLine")).toHaveCount(1);
	await after.click();
	await page.keyboard.insertText("not-editable");
	await expect(after).not.toContainText("not-editable");
});
