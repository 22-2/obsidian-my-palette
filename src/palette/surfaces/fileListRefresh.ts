import type { App, EventRef } from "obsidian";

const FILE_LIST_REFRESH_DELAY_MS = 400;

/**
 * Re-runs a view's current search when vault or metadata changes, so an open
 * result list does not stay stale until the next keystroke. A hidden view (a
 * background tab) waits until it is shown again, and then searches once.
 */
export class FileListRefresh {
	private registered = false;
	private timer?: number;
	/** A change arrived while the view was hidden. */
	private stale = false;

	constructor(
		private readonly app: App,
		private readonly registerEvent: (ref: EventRef) => void,
		private readonly isActive: () => boolean,
		private readonly isVisible: () => boolean,
		private readonly refresh: () => void,
	) {}

	/** Subscribes once; the view's own lifecycle unregisters the events. */
	register(): void {
		if (this.registered) return;
		this.registered = true;
		// Why: the file index (FileProvider) already updates on these events, but
		// the open list would stay stale until the next keystroke. Re-run the
		// current search so mtime/alias/frontmatter edits reorder the visible list.
		// Note: metadataCache `resolved` fires after the initial index pass and
		// again after later modifications, so it covers the startup bulk load too.
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
		// Why: switching tabs or opening a collapsed sidebar shows the view again.
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
		// vault `modify` fires per keystroke while editing; debounce the re-search
		// so a long edit session does not queue a search per character.
		this.cancel();
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			if (!this.isActive()) return;
			// Why: a search in a hidden view (Vault audit reads the whole vault) is wasted work
			// while the user edits notes elsewhere.
			if (!this.isVisible()) {
				this.stale = true;
				return;
			}
			this.stale = false;
			this.refresh();
		}, FILE_LIST_REFRESH_DELAY_MS);
	}
}
