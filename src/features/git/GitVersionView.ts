import type { FakeEditor } from "@22-2/obsidian-magical-editor";
import { ItemView, Menu, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { readVersion, validateHash } from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";
import { t } from "src/i18n";
import { GIT_VERSION_VIEW } from "src/features/git/gitVersionOpening";

export { GIT_VERSION_VIEW } from "src/features/git/gitVersionOpening";

interface VersionState {
	hash: string;
	path: string;
}

function versionState(value: unknown): VersionState | undefined {
	if (!value || typeof value !== "object") return;
	const state = value as Partial<VersionState>;
	if (typeof state.hash !== "string" || typeof state.path !== "string" || !state.path) return;
	try {
		validateHash(state.hash);
	} catch {
		return;
	}
	return { hash: state.hash, path: state.path };
}

export class GitVersionView extends ItemView {
	private version?: VersionState;
	private editor?: FakeEditor;
	private generation = 0;
	private versionTitleEl?: HTMLElement;
	private bodyEl?: HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}
	getViewType(): string {
		return GIT_VERSION_VIEW;
	}
	getDisplayText(): string {
		return this.version
			? `${this.version.path} · ${this.version.hash.slice(0, 8)}`
			: t("git.version.title");
	}
	getIcon(): string {
		return "file-clock";
	}
	getState(): Record<string, unknown> {
		return this.version ? { ...this.version } : {};
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("my-palette-git-version");
		this.versionTitleEl = this.contentEl.createDiv("my-palette-git-version-title");
		this.bodyEl = this.contentEl.createDiv("my-palette-git-version-body");
		this.registerDomEvent(
			this.contentEl,
			"contextmenu",
			(event) => {
				if (!this.editor?.view) return;
				event.preventDefault();
				event.stopPropagation();
				const selection = this.editor.editor.getSelection();
				const menu = new Menu();
				menu.addItem((item) =>
					item
						.setTitle(t("git.copySelection"))
						.setIcon("copy")
						.setDisabled(!selection)
						.onClick(() => void navigator.clipboard.writeText(selection)),
				);
				menu.showAtMouseEvent(event);
			},
			{ capture: true },
		);
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.version = versionState(state);
		await this.renderVersion();
		await super.setState(state, result);
	}

	async onClose(): Promise<void> {
		this.generation++;
		this.editor?.destroy();
		this.editor = undefined;
	}

	private async renderVersion(): Promise<void> {
		const generation = ++this.generation;
		const version = this.version;
		if (!version) return;
		this.versionTitleEl?.setText(
			`${version.path} · ${version.hash.slice(0, 8)} · ${t("git.version.readOnly")}`,
		);
		try {
			const root = await repositoryRoot(this.app);
			const text = await readVersion(root, version.hash, version.path);
			if (generation !== this.generation) return;
			if (!version.path.toLowerCase().endsWith(".md")) {
				this.replaceBody();
				this.bodyEl?.createEl("pre", { cls: "my-palette-git-content", text });
				return;
			}
			const { FakeEditor } = await import("@22-2/obsidian-magical-editor");
			if (generation !== this.generation) return;
			const editor = new FakeEditor(this.app, {
				initialContent: text,
				isReadOnly: true,
				autoFocus: false,
				hostLeaf: this.leaf,
			});
			await editor.ready;
			if (generation !== this.generation) {
				editor.destroy();
				return;
			}
			this.replaceBody();
			this.editor = editor;
			if (this.bodyEl) editor.loadToDom(this.bodyEl);
		} catch (error) {
			if (generation !== this.generation) return;
			this.replaceBody();
			this.bodyEl?.createDiv({
				cls: "my-palette-git-message",
				text: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private replaceBody(): void {
		this.editor?.destroy();
		this.editor = undefined;
		this.bodyEl?.empty();
	}
}
