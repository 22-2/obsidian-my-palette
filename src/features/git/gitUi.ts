import { Notice, type App } from "obsidian";
import { relative, isAbsolute, sep } from "node:path";
import type MyPalettePlugin from "src/main";
import type { GitFileResult } from "src/core/results";
import { getVaultRootPath } from "src/features/ignored-notes/ignoredPaths";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { copyPathToClipboard } from "src/ui/pathClipboard";
import {
	contentReference,
	git,
	githubFileUri,
	obsidianGitUri,
	readVersion,
} from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";
import { openGitVersion } from "src/features/git/gitVersionOpening";
import { openGitDiff } from "src/features/git/gitDiffOpening";
import { gitDiffState } from "src/features/git/gitDiffState";
import { t } from "src/i18n";

declare const electron: { shell: { openExternal(url: string): Promise<void> } };

async function showVersion(app: App, root: string, hash: string, path: string): Promise<void> {
	await readVersion(root, hash, path);
	await openGitVersion(app.workspace.getLeaf("tab"), hash, path);
}

export async function openGitFile(app: App, result: GitFileResult): Promise<void> {
	const ref = contentReference(result.commit, result.change);
	await showVersion(app, result.root, ref.hash, ref.path);
}

function run(action: () => Promise<void>): void {
	void action().catch(
		(error: unknown) => new Notice(error instanceof Error ? error.message : String(error)),
	);
}

async function githubUrl(root: string, hash: string, path: string): Promise<string> {
	const remote = (await git(root, ["remote", "get-url", "origin"])).toString("utf8").trim();
	const url = githubFileUri(remote, hash, path);
	if (!url) throw new Error(t("git.noGithub"));
	return url;
}

export function populateGitFileMenu(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	result: GitFileResult,
	activate: () => void,
	onDone?: () => void,
): void {
	const { app } = plugin;
	const { change, commit, root } = result;
	const ref = contentReference(commit, change);
	const add = (title: string, icon: string, action: () => void) =>
		menu.addItem((entry) => entry.setTitle(title).setIcon(icon).onClick(action));
	add(
		change.status.startsWith("D") ? t("git.openDeleted") : t("git.openVersion"),
		"file-text",
		activate,
	);
	add(t("git.diff"), "git-compare", () =>
		run(async () => {
			await openGitDiff(
				app.workspace.getLeaf("tab"),
				gitDiffState(commit.hash, commit.parents, change),
			);
			onDone?.();
		}),
	);
	const vault = getVaultRootPath(app);
	if (vault) {
		const local = relative(vault, `${root}/${change.path}`);
		if (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local)) {
			const current = app.vault.getFileByPath(local.replaceAll("\\", "/"));
			if (current)
				add(t("git.openCurrent"), "file", () =>
					run(async () => {
						await app.workspace.getLeaf(false).openFile(current);
						onDone?.();
					}),
				);
		}
	}
	menu.addSeparator();
	add(
		t("git.copyObsidian"),
		"link",
		() => void copyPathToClipboard(obsidianGitUri(app.vault.getName(), ref.hash, ref.path)),
	);
	add(t("git.copyContent"), "copy", () =>
		run(async () => {
			await copyPathToClipboard(await readVersion(root, ref.hash, ref.path));
		}),
	);
	add(t("git.copyGithub"), "github", () =>
		run(async () => {
			await copyPathToClipboard(await githubUrl(root, ref.hash, ref.path));
		}),
	);
	add(t("git.openGithub"), "github", () =>
		run(async () => {
			await electron.shell.openExternal(await githubUrl(root, ref.hash, ref.path));
		}),
	);
	add(t("git.copyPath"), "copy", () => void copyPathToClipboard(change.path));
	add(t("git.copyHash"), "copy", () => void copyPathToClipboard(commit.hash));
}

export function registerGitProtocol(plugin: MyPalettePlugin): void {
	plugin.registerObsidianProtocolHandler("my-palette-git", (params) => {
		run(async () => {
			if (params.vault !== plugin.app.vault.getName() || !params.commit || !params.path)
				throw new Error(t("git.invalidLink"));
			const root = await repositoryRoot(plugin.app);
			await showVersion(plugin.app, root, params.commit, params.path);
		});
	});
}
