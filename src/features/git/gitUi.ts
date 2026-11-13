import { Modal, Notice, type App } from "obsidian";
import { relative, isAbsolute } from "node:path";
import type MyPalettePlugin from "src/main";
import type { GitCommitResult } from "src/core/results";
import { getVaultRootPath } from "src/features/ignored-notes/ignoredPaths";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import { copyPathToClipboard } from "src/ui/pathClipboard";
import {
	contentReference,
	git,
	githubFileUri,
	listChanges,
	obsidianGitUri,
	readVersion,
	type GitChange,
} from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";
import { openGitVersion } from "src/features/git/gitVersionOpening";
import { t } from "src/i18n";

declare const electron: { shell: { openExternal(url: string): Promise<void> } };

interface ChangeItem extends SelectionItem {
	change: GitChange;
}

class GitTextModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly text: string,
	) {
		super(app);
	}
	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("pre", { cls: "my-palette-git-content", text: this.text });
	}
}

async function showVersion(app: App, root: string, hash: string, path: string): Promise<void> {
	await readVersion(root, hash, path);
	await openGitVersion(app.workspace.getLeaf("tab"), hash, path);
}

function report(error: unknown): void {
	new Notice(error instanceof Error ? error.message : String(error));
}

function run(action: () => Promise<void>): void {
	void action().catch(report);
}

async function githubUrl(root: string, hash: string, path: string): Promise<string> {
	const remote = (await git(root, ["remote", "get-url", "origin"])).toString("utf8").trim();
	const url = githubFileUri(remote, hash, path);
	if (!url) throw new Error(t("git.noGithub"));
	return url;
}

class GitChangesModal extends SelectionModal<ChangeItem> {
	private activeMenu?: PaletteMenu;
	constructor(
		private readonly plugin: MyPalettePlugin,
		private readonly root: string,
		private readonly commit: GitCommitResult,
		changes: GitChange[],
		private readonly closePalette?: () => void,
	) {
		super(
			{
				placeholder: t("git.files.placeholder"),
				footerText: t("git.files.footer", {
					hash: commit.hash.slice(0, 8),
					subject: commit.primary,
				}),
				getHotkeys: () => plugin.settings.hotkeys,
				items: changes.map((change) => ({
					label: change.path,
					description: change.oldPath ? `${change.oldPath} → ${change.path}` : undefined,
					badge: change.status,
					icon: "file",
					change,
				})),
			},
			plugin.app,
		);
	}

	protected override async onItemActivated(item: ChangeItem): Promise<void> {
		try {
			const ref = contentReference(this.commit, item.change);
			await showVersion(this.app, this.root, ref.hash, ref.path);
			this.close();
			this.closePalette?.();
		} catch (error) {
			report(error);
		}
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override onSelectionModalClose(): void {
		this.activeMenu?.close();
	}

	protected override onSuggestionContextMenu(item: ChangeItem, event: MouseEvent): void {
		this.activeMenu?.close();
		const menu = new PaletteMenu();
		this.activeMenu = menu;
		menu.enableFilter(this.app);
		menu.setParentElement(this.modalEl);
		const change = item.change;
		const ref = contentReference(this.commit, change);
		const add = (title: string, icon: string, action: () => void) =>
			menu.addItem((entry) => entry.setTitle(title).setIcon(icon).onClick(action));
		add(
			change.status.startsWith("D") ? t("git.openDeleted") : t("git.openVersion"),
			"file-text",
			() =>
				run(async () => {
					await showVersion(this.app, this.root, ref.hash, ref.path);
					this.close();
					this.closePalette?.();
				}),
		);
		add(t("git.diff"), "git-compare", () =>
			run(async () => {
				const parent = this.commit.parents[0];
				const args = parent
					? [
							"diff",
							"--no-ext-diff",
							"--no-textconv",
							"--no-color",
							parent,
							this.commit.hash,
							"--",
							...(change.oldPath ? [`:(literal)${change.oldPath}`] : []),
							`:(literal)${change.path}`,
						]
					: [
							"show",
							"--format=",
							"--no-ext-diff",
							"--no-textconv",
							"--no-color",
							this.commit.hash,
							"--",
							`:(literal)${change.path}`,
						];
				const text = (await git(this.root, args)).toString("utf8");
				new GitTextModal(this.app, t("git.diffTitle", { path: change.path }), text).open();
			}),
		);
		const vault = getVaultRootPath(this.app);
		if (vault) {
			const local = relative(vault, `${this.root}/${change.path}`);
			if (
				local !== ".." &&
				!local.startsWith(`..${this.pluginPathSeparator()}`) &&
				!isAbsolute(local)
			) {
				const current = this.app.vault.getFileByPath(local.replaceAll("\\", "/"));
				if (current)
					add(t("git.openCurrent"), "file", () =>
						run(async () => {
							await this.app.workspace.getLeaf(false).openFile(current);
						}),
					);
			}
		}
		menu.addSeparator();
		add(
			t("git.copyObsidian"),
			"link",
			() =>
				void copyPathToClipboard(
					obsidianGitUri(this.app.vault.getName(), ref.hash, ref.path),
				),
		);
		add(t("git.copyContent"), "copy", () =>
			run(async () => {
				await copyPathToClipboard(await readVersion(this.root, ref.hash, ref.path));
			}),
		);
		add(t("git.copyGithub"), "github", () =>
			run(async () => {
				await copyPathToClipboard(await githubUrl(this.root, ref.hash, ref.path));
			}),
		);
		add(t("git.openGithub"), "github", () =>
			run(async () => {
				await electron.shell.openExternal(await githubUrl(this.root, ref.hash, ref.path));
			}),
		);
		add(t("git.copyPath"), "copy", () => void copyPathToClipboard(change.path));
		add(t("git.copyHash"), "copy", () => void copyPathToClipboard(this.commit.hash));
		showMenuAtEvent(menu, event);
	}

	private pluginPathSeparator(): string {
		return process.platform === "win32" ? "\\" : "/";
	}
}

export async function openGitChanges(
	plugin: MyPalettePlugin,
	commit: GitCommitResult,
	closePalette?: () => void,
): Promise<void> {
	try {
		const root = await repositoryRoot(plugin.app);
		const changes = await listChanges(root, commit);
		new GitChangesModal(plugin, root, commit, changes, closePalette).open();
	} catch (error) {
		report(error);
	}
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
