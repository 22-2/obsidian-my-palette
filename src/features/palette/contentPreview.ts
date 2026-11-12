import { TFile, type App } from "obsidian";
import type { PaletteResult } from "src/core/results";

const MAX_BYTES = 1024 * 1024;
const MAX_CONCURRENT = 3;
const MAX_CACHE = 100;
const CONTEXT = 55;
const caches = new WeakMap<App, Map<string, ContentExcerpt | null>>();

/** Everything の構文を推測せず、単独の文字列検索だけを扱う。 */
export function contentPreviewTerm(query: string): string | undefined {
	const match = /^content:(?:"([^"\r\n]+)"|([^\s"!|<>*?():]+))\s*$/i.exec(query.trim());
	const term = match?.[1] ?? match?.[2];
	return term?.trim() && !/[*?]/.test(term) ? term : undefined;
}

export interface ContentExcerpt {
	before: string;
	match: string;
	after: string;
}

export function contentExcerpt(content: string, term: string): ContentExcerpt | undefined {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const found = new RegExp(escaped, "iu").exec(content);
	if (!found) return undefined;
	const index = found.index;
	const start = Math.max(0, index - CONTEXT);
	const end = Math.min(content.length, index + term.length + CONTEXT);
	const clean = (text: string) => text.replace(/\s+/g, " ");
	return {
		before: (start ? "…" : "") + clean(content.slice(start, index)),
		match: content.slice(index, index + term.length),
		after: clean(content.slice(index + term.length, end)) + (end < content.length ? "…" : ""),
	};
}

type Pending = {
	row: HTMLElement;
	element: HTMLElement;
	result: Extract<PaletteResult, { mode: "everything" }>;
	term: string;
	query: string;
};

/** 表示中の行だけを読み、候補の描画や検索を待たせない。 */
export class ContentPreview {
	private observer?: IntersectionObserver;
	private readonly pending = new WeakMap<Element, Pending>();
	private queue: Pending[] = [];
	private active = 0;
	private disposed = false;
	private readonly cache: Map<string, ContentExcerpt | null>;

	constructor(
		private readonly app: App,
		private readonly currentQuery: () => string,
	) {
		this.cache = caches.get(app) ?? new Map<string, ContentExcerpt | null>();
		caches.set(app, this.cache);
	}

	observe(result: PaletteResult, element: HTMLElement, query: string): void {
		if (
			result.mode !== "everything" ||
			result.kind !== "file" ||
			!/\.(md|txt)$/i.test(result.absolutePath)
		)
			return;
		const term = contentPreviewTerm(query);
		const body = element.querySelector<HTMLElement>(".my-palette-suggestion__body");
		if (!term || !body || !result.vaultPath) return;
		const Observer = element.ownerDocument.defaultView?.IntersectionObserver;
		if (!Observer) return;
		this.observer ??= new Observer((entries) => {
			for (const entry of entries) {
				const task = this.pending.get(entry.target);
				if (!task) continue;
				if (entry.isIntersecting) {
					if (!this.queue.includes(task)) this.queue.push(task);
				} else {
					this.queue = this.queue.filter((item) => item !== task);
				}
			}
			this.pump();
		});
		this.pending.set(element, { row: element, element: body, result, term, query });
		this.observer.observe(element);
	}

	reset(): void {
		this.observer?.disconnect();
		this.observer = undefined;
		this.queue = [];
	}

	dispose(): void {
		this.disposed = true;
		this.reset();
	}

	private pump(): void {
		while (!this.disposed && this.active < MAX_CONCURRENT && this.queue.length) {
			const task = this.queue.shift();
			if (!task) continue;
			this.observer?.unobserve(task.row);
			this.pending.delete(task.row);
			if (!this.valid(task)) continue;
			this.active++;
			void this.read(task)
				.then((excerpt) => {
					if (!excerpt || !this.valid(task)) return;
					const line = task.element.createDiv("my-palette-suggestion__content-preview");
					line.append(excerpt.before);
					const match = line.createSpan("my-palette-suggestion__match");
					match.textContent = excerpt.match;
					line.append(match, excerpt.after);
				})
				.catch(() => {
					// ファイルの削除や読み取り権限の変化は検索結果そのものを妨げない。
				})
				.finally(() => {
					this.active--;
					this.pump();
				});
		}
	}

	private valid(task: Pending): boolean {
		return !this.disposed && task.element.isConnected && this.currentQuery() === task.query;
	}

	private async read(task: Pending): Promise<ContentExcerpt | undefined> {
		const path = task.result.vaultPath;
		if (!path) return undefined;
		const stat = await this.app.vault.adapter.stat(path);
		if (!stat || stat.type !== "file" || stat.size > MAX_BYTES || !this.valid(task))
			return undefined;
		const key = JSON.stringify([path, stat.mtime, stat.size, task.term]);
		if (this.cache.has(key)) {
			const cached = this.cache.get(key) ?? null;
			this.cache.delete(key);
			this.cache.set(key, cached);
			return cached ?? undefined;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		const content =
			file instanceof TFile
				? await this.app.vault.cachedRead(file)
				: await this.app.vault.adapter.read(path);
		if (!this.valid(task)) return undefined;
		const excerpt = contentExcerpt(content, task.term);
		this.cache.set(key, excerpt ?? null);
		if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
		return excerpt;
	}
}
