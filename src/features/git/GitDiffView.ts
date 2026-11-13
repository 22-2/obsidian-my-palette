import { goToNextChunk, goToPreviousChunk, MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ItemView, Menu, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { readVersion, validateHash } from "src/features/git/gitClient";
import { repositoryRoot } from "src/features/git/gitRepository";
import { GIT_DIFF_VIEW } from "src/features/git/gitDiffOpening";
import type { GitDiffSide, GitDiffState } from "src/features/git/gitDiffState";
import { t } from "src/i18n";

function isSide(value: unknown): value is GitDiffSide {
	if (!value || typeof value !== "object") return false;
	const side = value as Partial<GitDiffSide>;
	if (typeof side.path !== "string" || !side.path) return false;
	if (side.hash === undefined) return true;
	if (typeof side.hash !== "string") return false;
	try {
		validateHash(side.hash);
		return true;
	} catch {
		return false;
	}
}

function isDiffState(value: unknown): value is GitDiffState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<GitDiffState>;
	return isSide(state.left) && isSide(state.right);
}

function sideLabel(side: GitDiffSide): string {
	return `${side.hash ? side.hash.slice(0, 8) : t("git.diff.empty")} · ${side.path}`;
}

function readOnlyExtensions() {
	return [
		EditorState.readOnly.of(true),
		EditorView.lineWrapping,
		EditorState.phrases.of({
			"$ unchanged lines": t("git.diff.unchanged"),
			"Expand all": t("git.diff.expandAll"),
		}),
		EditorView.domEventHandlers({
			contextmenu: (event, view) => {
				event.preventDefault();
				event.stopPropagation();
				const { from, to } = view.state.selection.main;
				const menu = new Menu();
				menu.addItem((item) =>
					item
						.setTitle(t("git.copySelection"))
						.setIcon("copy")
						.setDisabled(from === to)
						.onClick(
							() => void navigator.clipboard.writeText(view.state.sliceDoc(from, to)),
						),
				);
				menu.showAtMouseEvent(event);
				return true;
			},
		}),
	];
}

export class GitDiffView extends ItemView {
	private diff?: GitDiffState;
	private merge?: MergeView;
	private generation = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}
	getViewType(): string {
		return GIT_DIFF_VIEW;
	}
	getDisplayText(): string {
		return this.diff ? t("git.diffTitle", { path: this.diff.right.path }) : t("git.diff");
	}
	getIcon(): string {
		return "git-compare";
	}
	getState(): Record<string, unknown> {
		return this.diff ? { ...this.diff } : {};
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("my-palette-git-diff");
		this.addAction("arrow-up", t("git.diff.previous"), () => {
			if (this.merge) goToPreviousChunk(this.merge.b);
		});
		this.addAction("arrow-down", t("git.diff.next"), () => {
			if (this.merge) goToNextChunk(this.merge.b);
		});
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.diff = isDiffState(state) ? state : undefined;
		await this.renderDiff();
		await super.setState(state, result);
	}

	async onClose(): Promise<void> {
		this.generation++;
		this.merge?.destroy();
		this.merge = undefined;
	}

	private async renderDiff(): Promise<void> {
		const generation = ++this.generation;
		const state = this.diff;
		if (!state) return;
		try {
			const root = await repositoryRoot(this.app);
			const read = (side: GitDiffSide) =>
				side.hash ? readVersion(root, side.hash, side.path) : Promise.resolve("");
			const [left, right] = await Promise.all([read(state.left), read(state.right)]);
			if (generation !== this.generation) return;
			this.merge?.destroy();
			this.contentEl.empty();
			const labels = this.contentEl.createDiv("my-palette-git-diff-labels");
			labels.createDiv({ cls: "my-palette-git-diff-label", text: sideLabel(state.left) });
			labels.createDiv({ cls: "my-palette-git-diff-label", text: sideLabel(state.right) });
			this.merge = new MergeView({
				a: { doc: left, extensions: readOnlyExtensions() },
				b: { doc: right, extensions: readOnlyExtensions() },
				parent: this.contentEl.createDiv("my-palette-git-diff-body"),
				highlightChanges: true,
				gutter: true,
				collapseUnchanged: { margin: 3, minSize: 6 },
			});
		} catch (error) {
			if (generation !== this.generation) return;
			this.merge?.destroy();
			this.merge = undefined;
			this.contentEl.empty();
			this.contentEl.createDiv({
				cls: "my-palette-git-message",
				text: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
