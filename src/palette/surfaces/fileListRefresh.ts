import type { App, EventRef } from "obsidian";

const FILE_LIST_REFRESH_DELAY_MS = 400;

/**
 * Re-runs a view's current search when vault or metadata changes, so an open
 * result list does not stay stale until the next keystroke.
 */
export class FileListRefresh {
	private registered = false;
	private timer?: number;

	constructor(
		private readonly app: App,
		private readonly registerEvent: (ref: EventRef) => void,
		private readonly isActive: () => boolean,
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
		const { vault, metadataCache } = this.app;
		this.registerEvent(vault.on("create", schedule));
		this.registerEvent(vault.on("modify", schedule));
		this.registerEvent(vault.on("delete", schedule));
		this.registerEvent(vault.on("rename", schedule));
		this.registerEvent(metadataCache.on("changed", schedule));
		this.registerEvent(metadataCache.on("deleted", schedule));
		this.registerEvent(metadataCache.on("resolve", schedule));
		this.registerEvent(metadataCache.on("resolved", schedule));
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
			if (this.isActive()) this.refresh();
		}, FILE_LIST_REFRESH_DELAY_MS);
	}
}
