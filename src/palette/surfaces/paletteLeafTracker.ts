import { TFile, type App, type View, type WorkspaceLeaf } from "obsidian";

/**
 * Resolves which center-pane leaf and note a persistent palette view acts on.
 * The palette itself, and any other palette view, is never a valid target.
 */
export class PaletteLeafTracker {
	private targetLeaf?: WorkspaceLeaf;

	constructor(
		private readonly app: App,
		private readonly ownLeaf: WorkspaceLeaf,
		private readonly isPaletteView: (view: View) => boolean,
	) {}

	/** Remembers a center leaf as the latest open target; other leaves are ignored. */
	track(leaf: WorkspaceLeaf | undefined): boolean {
		if (!leaf || !this.isCenterLeaf(leaf)) return false;
		this.targetLeaf = leaf;
		return true;
	}

	/** Re-detects the target at surface creation, keeping the old one as a fallback. */
	refresh(): void {
		this.targetLeaf = this.findTargetLeaf() ?? this.targetLeaf;
	}

	resolveTargetLeaf(): WorkspaceLeaf {
		// Clicks in the sidebar must always open in the center: never reuse a
		// sidebar leaf, and never trust a cached leaf that has moved out of
		// the main area. Prefer the current center leaf over any history.
		const active = this.app.workspace.activeLeaf;
		if (active && this.isCenterLeaf(active)) {
			this.targetLeaf = active;
			return active;
		}
		if (this.targetLeaf && this.isCenterLeaf(this.targetLeaf)) return this.targetLeaf;
		// A sidebar can be opened with no note pane at all. Allocate a normal tab
		// once so a first zap can never replace the palette view itself.
		this.targetLeaf = this.app.workspace.getLeaf("tab");
		return this.targetLeaf;
	}

	findTargetLeaf(sourcePath?: string): WorkspaceLeaf | undefined {
		if (
			this.targetLeaf &&
			this.isCenterLeaf(this.targetLeaf) &&
			(!sourcePath || this.fileOf(this.targetLeaf)?.path === sourcePath)
		)
			return this.targetLeaf;
		if (sourcePath) {
			let match: WorkspaceLeaf | undefined;
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (!match && this.isCenterLeaf(leaf) && this.fileOf(leaf)?.path === sourcePath)
					match = leaf;
			});
			if (match) return match;
		}
		const active = this.app.workspace.activeLeaf;
		if (active && this.isCenterLeaf(active)) return active;
		// Why: opening or restoring the sidebar can make the palette the active
		// leaf before tracking is registered. The most recent center leaf preserves
		// the user's current tab in that startup window, including non-file views.
		const recent = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		return recent && this.isCenterLeaf(recent) ? recent : undefined;
	}

	currentSourceFile(): TFile | undefined {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && this.isCenterLeaf(activeLeaf)) return this.fileOf(activeLeaf);
		if (this.targetLeaf && this.isCenterLeaf(this.targetLeaf))
			return this.fileOf(this.targetLeaf);
		const recentLeaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		return recentLeaf
			? this.fileOf(recentLeaf)
			: (this.app.workspace.getActiveFile() ?? undefined);
	}

	sourceFile(sourcePath?: string): TFile | undefined {
		if (!sourcePath) return undefined;
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		return file instanceof TFile ? file : undefined;
	}

	isCenterLeaf(leaf: WorkspaceLeaf): boolean {
		// Why: a table moved into the center must never become another palette's
		// open target or source note. The shared base covers both registered views.
		if (leaf === this.ownLeaf || this.isPaletteView(leaf.view)) return false;
		try {
			// Sidebar leaves live under leftSplit/rightSplit; only rootSplit is center.
			return leaf.getRoot() === this.app.workspace.rootSplit;
		} catch {
			return true;
		}
	}

	fileOf(leaf: WorkspaceLeaf): TFile | undefined {
		const file = (leaf.view as { file?: unknown }).file;
		return file && typeof file === "object" && "path" in file ? (file as TFile) : undefined;
	}
}
