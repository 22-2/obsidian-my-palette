import { TFile, type App, type View, type WorkspaceLeaf } from "obsidian";

/**
 * 常駐のパレットビューが操作する、中央のペインのリーフとノートを決める。
 * パレット自身と、ほかのパレットのビューは、対象として有効にしない。
 */
export class PaletteLeafTracker {
	private targetLeaf?: WorkspaceLeaf;

	constructor(
		private readonly app: App,
		private readonly ownLeaf: WorkspaceLeaf,
		private readonly isPaletteView: (view: View) => boolean,
	) {}

	/** 中央のリーフを、最新の開く対象として覚える。ほかのリーフは無視する。 */
	track(leaf: WorkspaceLeaf | undefined): boolean {
		if (!leaf || !this.isCenterLeaf(leaf)) return false;
		this.targetLeaf = leaf;
		return true;
	}

	/** ビューを作るときに対象を検出し直す。古い対象は、見つからない場合の予備として残す。 */
	refresh(): void {
		this.targetLeaf = this.findTargetLeaf() ?? this.targetLeaf;
	}

	resolveTargetLeaf(): WorkspaceLeaf {
		// サイドバーでのクリックは、必ず中央で開く。サイドバーのリーフは再利用せず、
		// メインの領域から移動したキャッシュ済みのリーフも信用しない。履歴よりも、
		// いま中央にあるリーフを優先する。
		const active = this.app.workspace.getMostRecentLeaf();
		if (active && this.isCenterLeaf(active)) {
			this.targetLeaf = active;
			return active;
		}
		if (this.targetLeaf && this.isCenterLeaf(this.targetLeaf)) return this.targetLeaf;
		// ノートのペインがないサイドバーも開ける。最初の操作でパレットのビュー自身を
		// 置き換えないように、通常のタブを一度だけ作る。
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
		const active = this.app.workspace.getMostRecentLeaf();
		if (active && this.isCenterLeaf(active)) return active;
		// Why: サイドバーを開く、または復元すると、追跡が登録される前にパレットがアクティブな
		// リーフになることがある。最近の中央のリーフを使えば、その起動の間もユーザーの現在のタブを
		// 保てる。ファイル以外のビューも含めて。
		const recent = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		return recent && this.isCenterLeaf(recent) ? recent : undefined;
	}

	currentSourceFile(): TFile | undefined {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
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
		// Why: 中央に移された表が、別のパレットの開く対象や元のノートになることは絶対に避ける。
		// 共通の基底が、登録済みの両方のビューを対象にする。
		if (leaf === this.ownLeaf || this.isPaletteView(leaf.view)) return false;
		try {
			// サイドバーのリーフは leftSplit/rightSplit の下にある。中央は rootSplit だけ。
			return leaf.getRoot() === this.app.workspace.rootSplit;
		} catch {
			return true;
		}
	}

	fileOf(leaf: WorkspaceLeaf): TFile | undefined {
		const file = (leaf.view as { file?: unknown }).file;
		return hasPath(file) ? file : undefined;
	}
}

/** ビューのファイルはパスを持つ。確認することで、不明な値を TFile にキャストせずに済む。 */
function hasPath(value: unknown): value is TFile {
	return typeof value === "object" && value !== null && "path" in value;
}
