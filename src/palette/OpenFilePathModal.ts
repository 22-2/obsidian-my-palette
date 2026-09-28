import { Modal, Notice, TFile } from "obsidian";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { getVaultFullPath, getVaultRootPath } from "src/ignored-notes/ignoredPaths";
import { isMarkdownPath } from "src/shared/externalFiles";
import { getLeafForAction } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";

/** 入力パス前後のクォートを除去する。エクスプローラからのコピー貼付け対策。 */
export function normalizeFilePathInput(rawInput: string): string {
	const trimmed = rawInput.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'"))
			return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

/** Vault内パスまたは絶対パスを内部エディタで開くためのパス入力モーダル。 */
export class OpenFilePathModal extends Modal {
	private inputEl!: HTMLInputElement;

	constructor(private readonly plugin: MyPalettePlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-file-path-modal");
		this.titleEl.setText("Open file path in editor");
		const container = this.contentEl.createDiv("my-palette-file-path-modal__body");
		this.inputEl = container.createEl("input", {
			type: "text",
			placeholder: "Vault path or absolute path (e.g. notes/todo.md)",
			cls: "prompt-input",
		});
		this.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.openInputPath();
			}
		});
		window.setTimeout(() => this.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async openInputPath(): Promise<void> {
		const input = normalizeFilePathInput(this.inputEl.value);
		if (!input) {
			new Notice("Enter a Vault path or an absolute path.");
			return;
		}
		// なぜVault優先か: Vault相対パスはTFileとして開くことでリンク・履歴と
		// 一貫した扱いになり、外部Markdownはfile:ビューで別扱いになるため。
		const vaultFile = this.plugin.app.vault.getAbstractFileByPath(input);
		if (vaultFile instanceof TFile) {
			await getLeafForAction(this.plugin.app, "primary").openFile(vaultFile, {
				active: true,
			});
			this.close();
			return;
		}
		const absolutePath = this.toAbsolutePath(input);
		if (!absolutePath || !isMarkdownPath(absolutePath)) {
			new Notice("Only Vault files or Markdown paths can be opened in the editor.");
			return;
		}
		try {
			await getDesktopAdapter(this.plugin.app).fs.promises.stat(absolutePath);
		} catch {
			new Notice("The selected path no longer exists.");
			return;
		}
		// 内部エディタ指定のため設定のopenExternalMarkdownInObsidianを迂回し、
		// 常にネイティブMarkdownビューで開く。
		await this.plugin.openExternalMarkdown(absolutePath, "primary", true, true);
		this.close();
	}

	private toAbsolutePath(input: string): string | null {
		const path = getDesktopAdapter(this.plugin.app).path;
		if (path.isAbsolute(input)) return path.resolve(input);
		const vaultFullPath = getVaultFullPath(this.plugin.app, input);
		if (vaultFullPath) return vaultFullPath;
		const root = getVaultRootPath(this.plugin.app);
		return root ? path.resolve(root, input) : null;
	}
}
