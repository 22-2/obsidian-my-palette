import type { TFile } from "obsidian";
import type { EverythingScope, PaletteMode, PaletteResult, ParsedInput } from "src/model/results";
import type MyPalettePlugin from "src/main";
import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";

export type FixedPaletteMode = Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">;

export type RecordableSearch = {
	query: string;
	category: ReturnType<typeof getSearchHistoryCategory>;
	includeIgnored: boolean;
};

export interface PaletteSearchState {
	input: string;
	query: string;
	mode: PaletteMode;
	everythingScope: EverythingScope;
	includeIgnored: boolean;
	results: PaletteResult[];
	resultCount: number;
	error?: string;
}

export interface PaletteSearchSessionOptions {
	initialInput?: string;
	fixedMode?: FixedPaletteMode;
	sourceFile?: TFile;
	onStateChange?: (state: PaletteSearchState) => void;
}

/**
 * Owns the palette's input-to-provider pipeline independently of a UI host.
 * The modal and the persistent workspace view must share cancellation, history,
 * and stale-result handling; keeping those rules here prevents the two shells
 * from slowly developing different search behavior.
 */
export class PaletteSearchSession {
	private generation = 0;
	private controller?: AbortController;
	private historyCommittedGeneration = -1;
	private disposed = false;
	private readonly fixedMode?: FixedPaletteMode;
	private readonly sourceFile?: TFile;
	private readonly onStateChange?: (state: PaletteSearchState) => void;
	private state: PaletteSearchState;

	constructor(
		private readonly plugin: MyPalettePlugin,
		{
			initialInput = "",
			fixedMode,
			sourceFile,
			onStateChange,
		}: PaletteSearchSessionOptions = {},
	) {
		this.fixedMode = fixedMode;
		this.sourceFile = sourceFile;
		this.onStateChange = onStateChange;
		const parsed = this.parse(initialInput);
		this.state = {
			input: initialInput,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			includeIgnored: parsed.includeIgnored,
			results: [],
			resultCount: 0,
		};
	}

	get current(): PaletteSearchState {
		return this.state;
	}

	get input(): string {
		return this.state.input;
	}

	get fixed(): FixedPaletteMode | undefined {
		return this.fixedMode;
	}

	/** Start a new provider search and discard any result from an older input. */
	async search(
		input = this.state.input,
		options: { suppressHistory?: boolean } = {},
	): Promise<PaletteResult[]> {
		if (this.disposed) return [];
		void options;
		this.controller?.abort();
		const generation = ++this.generation;
		this.historyCommittedGeneration = -1;
		const parsed = this.parse(input);
		this.state = {
			...this.state,
			input,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			includeIgnored: parsed.includeIgnored,
			results: [],
			resultCount: 0,
			error: undefined,
		};
		this.emit();

		this.plugin.rememberPaletteQuery(parsed.mode, parsed.query, input);
		// History is committed when the result list receives focus. Keeping it out
		// of the search pipeline prevents typing alone from creating history.

		const delay = parsed.mode === "everything" ? this.plugin.settings.everything.debounceMs : 0;
		if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
		if (this.disposed || generation !== this.generation) return [];

		this.controller = new AbortController();
		try {
			const results = await this.plugin.providers[parsed.mode].search({
				mode: parsed.mode,
				query: parsed.query,
				signal: this.controller.signal,
				everythingScope: this.scopeOf(parsed),
				includeIgnored: parsed.includeIgnored,
				sourceFile: this.sourceFile,
			});
			if (this.disposed || generation !== this.generation) return [];
			this.state = { ...this.state, results, resultCount: results.length, error: undefined };
			this.emit();
			return results;
		} catch (error) {
			if (
				this.disposed ||
				generation !== this.generation ||
				(error instanceof DOMException && error.name === "AbortError")
			)
				return [];
			this.state = {
				...this.state,
				results: [],
				resultCount: 0,
				error: error instanceof Error ? error.message : String(error),
			};
			this.emit();
			return [];
		}
	}

	setInput(input: string, options: { suppressHistory?: boolean } = {}): void {
		void this.search(input, options);
	}

	setInputFromHistory(input: string): void {
		this.setInput(input, { suppressHistory: true });
	}

	getSearchHistoryContext(input = this.state.input): RecordableSearch {
		const parsed = this.parse(input);
		return {
			query: parsed.query,
			category: getSearchHistoryCategory(parsed),
			includeIgnored: parsed.includeIgnored,
		};
	}

	getRecordableSearch(input = this.state.input): RecordableSearch | undefined {
		const search = this.getSearchHistoryContext(input);
		return search.query.trim() ? search : undefined;
	}

	commitCurrentSearch(): void {
		if (this.historyCommittedGeneration === this.generation) return;
		const search = this.getRecordableSearch();
		if (!search) return;
		this.historyCommittedGeneration = this.generation;
		this.plugin.recordSearch(search.query, search.category, search.includeIgnored);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation += 1;
		this.controller?.abort();
	}

	private parse(input: string): ParsedInput {
		return this.fixedMode
			? { raw: input, mode: this.fixedMode, query: input, includeIgnored: false }
			: parseInput(input, this.plugin.settings.prefixes);
	}

	private scopeOf(parsed: ParsedInput): EverythingScope {
		return ("everythingScope" in parsed ? parsed.everythingScope : undefined) ?? "vault";
	}

	private emit(): void {
		this.onStateChange?.(this.state);
	}
}

export function palettePlaceholder(mode: PaletteMode): string {
	return mode === "link"
		? "Search links in the active file"
		: mode === "backlink"
			? "Search backlinks to the active file"
			: mode === "bookmark"
				? "Search bookmarks"
				: mode === "smart"
					? "Search Smart Connections"
					: "Search files";
}
