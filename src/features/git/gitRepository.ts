import type { App } from "obsidian";
import { getVaultRootPath } from "src/features/ignored-notes/ignoredPaths";
import { git } from "src/features/git/gitClient";

export async function repositoryRoot(app: App, signal?: AbortSignal): Promise<string> {
	const vault = getVaultRootPath(app);
	if (!vault) throw new Error("保管庫のフォルダーを取得できません。");
	return (await git(vault, ["rev-parse", "--show-toplevel"], signal)).toString("utf8").trim();
}
