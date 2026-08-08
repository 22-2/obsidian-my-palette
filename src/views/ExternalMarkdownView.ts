import { FakeEditor } from "@22-2/obsidian-magical-editor";
import { ItemView, Menu, Notice, type WorkspaceLeaf } from "obsidian";
import { getVaultRootPath } from "src/core/ignoredPaths";
import { getDesktopAdapter } from "src/core/desktopAdapter";
import { openPathInCode } from "src/core/vscode";

export const EXTERNAL_MARKDOWN_VIEW_TYPE = "my-palette-external-markdown";

interface ExternalMarkdownViewState extends Record<string, unknown> {
	path?: unknown;
	autoFocus?: unknown;
	preview?: unknown;
}

export class ExternalMarkdownView extends ItemView {
	private filePath = "";
	private editor?: FakeEditor;
	private loadGeneration = 0;
	private autoFocus = true;
	private preview = false;
	navigation = true;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return EXTERNAL_MARKDOWN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.filePath
			? getDesktopAdapter(this.app).path.basename(this.filePath)
			: "External Markdown";
	}

	getIcon(): string {
		return "file-text";
	}

	getFilePath(): string {
		return this.filePath;
	}

	isPreview(): boolean {
		return this.preview;
	}

	getState(): ExternalMarkdownViewState {
		return { path: this.filePath, autoFocus: this.autoFocus, preview: this.preview };
	}

	async setState(state: ExternalMarkdownViewState): Promise<void> {
		const nextPath =
			typeof state.path === "string"
				? getDesktopAdapter(this.app).path.resolve(state.path)
				: "";
		this.autoFocus = state.autoFocus !== false;
		this.preview = state.preview === true;
		if (!nextPath) return;
		if (nextPath === this.filePath) {
			if (this.autoFocus) this.editor?.focus();
			return;
		}
		this.filePath = nextPath;
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
		this.app.workspace.requestSaveLayout();
		await this.loadFile();
	}

	async onOpen(): Promise<void> {
		if (this.filePath) await this.loadFile();
	}

	async onClose(): Promise<void> {
		this.destroyEditor();
	}

	onPaneMenu(menu: Menu, source: string): void {
		if (this.filePath) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Copy path relative to Vault")
					.setIcon("copy")
					.onClick(() => void this.copyPath(this.relativePath())),
			);
			menu.addItem((item) =>
				item
					.setTitle("Copy absolute path")
					.setIcon("clipboard-copy")
					.onClick(() => void this.copyPath(this.filePath)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in VS Code")
					.setIcon("code-xml")
					.onClick(() => void this.openInCode()),
			);
		}
		super.onPaneMenu(menu, source);
	}

	private async loadFile(): Promise<void> {
		const generation = ++this.loadGeneration;
		this.destroyEditor();
		this.contentEl.empty();
		this.contentEl.addClass("my-palette-external-markdown");

		let content: string;
		try {
			content = await getDesktopAdapter(this.app).fs.promises.readFile(this.filePath, "utf8");
		} catch (error) {
			if (generation !== this.loadGeneration) return;
			this.renderError(error);
			return;
		}
		if (generation !== this.loadGeneration) return;

		const header = this.contentEl.createDiv({ cls: "my-palette-external-markdown__header" });
		header.createDiv({ cls: "my-palette-external-markdown__path", text: this.filePath });
		const editorArea = this.contentEl.createDiv({
			cls: "my-palette-external-markdown__editor",
		});
		this.editor = new FakeEditor(this.app, {
			hostLeaf: this.leaf,
			initialContent: content,
			autoFocus: this.autoFocus,
		});
		await this.editor.ready;
		if (generation !== this.loadGeneration) {
			this.destroyEditor();
			return;
		}
		this.editor.loadToDom(editorArea);
		if (this.autoFocus) this.editor.focus();
	}

	private destroyEditor(): void {
		this.editor?.destroy();
		this.editor = undefined;
	}

	private relativePath(): string {
		const vaultRoot = getVaultRootPath(this.app);
		return vaultRoot
			? getDesktopAdapter(this.app).path.relative(vaultRoot, this.filePath) || "."
			: this.filePath;
	}

	private async copyPath(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			new Notice("Path copied.");
		} catch {
			new Notice("Could not copy the path.");
		}
	}

	private async openInCode(): Promise<void> {
		const error = await openPathInCode(this.filePath);
		if (error) new Notice(error);
	}

	private renderError(error: unknown): void {
		this.contentEl.createDiv({
			cls: "my-palette-external-markdown__error",
			text: `Could not open ${this.filePath}: ${messageOf(error)}`,
		});
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
