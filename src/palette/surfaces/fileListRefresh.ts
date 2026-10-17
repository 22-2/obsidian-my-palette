import type { App, EventRef } from "obsidian";

const FILE_LIST_REFRESH_DELAY_MS = 400;

/**
 * Vault やメタデータが変わったら、ビューの現在の検索をやり直す。開いている結果の一覧が、
 * 次のキーストロークまで古いままにならないようにするため。非表示のビュー(バックグラウンドの
 * タブ)は、再び表示されるまで待ち、そのあとに一度だけ検索する。
 */
export class FileListRefresh {
	private registered = false;
	private timer?: number;
	/** ビューが非表示の間に変更が届いた。 */
	private stale = false;

	constructor(
		private readonly app: App,
		private readonly registerEvent: (ref: EventRef) => void,
		private readonly isActive: () => boolean,
		private readonly isVisible: () => boolean,
		private readonly refresh: () => void,
	) {}

	/** 購読は一度だけ行う。イベントの登録解除は、ビュー自身のライフサイクルが行う。 */
	register(): void {
		if (this.registered) return;
		this.registered = true;
		// Why: ファイルの索引(FileProvider)はすでにこれらのイベントで更新されるが、開いている一覧は
		// 次のキーストロークまで古いままになる。現在の検索をやり直し、mtime・別名・フロントマターの
		// 編集で、表示中の一覧の並びが変わるようにする。
		// 注: metadataCache の `resolved` は、初回の索引の後と、以降の変更の後に発火するので、
		// 起動時の一括読み込みも対象に含む。
		const schedule = (): void => this.schedule();
		const { vault, metadataCache, workspace } = this.app;
		this.registerEvent(vault.on("create", schedule));
		this.registerEvent(vault.on("modify", schedule));
		this.registerEvent(vault.on("delete", schedule));
		this.registerEvent(vault.on("rename", schedule));
		this.registerEvent(metadataCache.on("changed", schedule));
		this.registerEvent(metadataCache.on("deleted", schedule));
		this.registerEvent(metadataCache.on("resolve", schedule));
		this.registerEvent(metadataCache.on("resolved", schedule));
		// Why: タブを切り替えたり、折りたたまれたサイドバーを開いたりすると、ビューが再び表示される。
		const scheduleIfStale = (): void => {
			if (this.stale) this.schedule();
		};
		this.registerEvent(workspace.on("layout-change", scheduleIfStale));
		this.registerEvent(workspace.on("active-leaf-change", scheduleIfStale));
	}

	cancel(): void {
		if (this.timer === undefined) return;
		window.clearTimeout(this.timer);
		this.timer = undefined;
	}

	private schedule(): void {
		if (!this.isActive()) return;
		// vault の `modify` は編集中のキーストロークごとに発火する。再検索をデバウンスして、
		// 長い編集の間に一文字ごとの検索が積み上がらないようにする。
		this.cancel();
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			if (!this.isActive()) return;
			// Why: 非表示のビュー(Vault 監査は Vault 全体を読む)での検索は、ユーザーが別の場所で
			// ノートを編集している間は無駄な作業になる。
			if (!this.isVisible()) {
				this.stale = true;
				return;
			}
			this.stale = false;
			this.refresh();
		}, FILE_LIST_REFRESH_DELAY_MS);
	}
}
