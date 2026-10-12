import type { TFile } from "obsidian";
import {
	supportsIncludeIgnored,
	type EverythingScope,
	type PaletteMode,
	type PaletteResult,
	type ParsedInput,
} from "src/palette/results";
import type MyPalettePlugin from "src/main";
import { getSearchHistoryCategory } from "src/palette/inputParser";
import {
	findPaletteMode,
	getPaletteMode,
	matchPaletteModes,
	paletteModeAlias,
	parseDirectModeEntry,
	type PaletteModeId,
} from "src/palette/modes";
import type { ModeEntryResult } from "src/palette/results";

export type FixedPaletteMode = Extract<
	PaletteMode,
	"link" | "backlink" | "bookmark" | "smart" | "tab"
>;

/**
 * Where a navigating palette is. Root Search lists mode entries above the files
 * (unless `modeEntries` is off); a mode shows one provider without a prefix.
 */
export type PaletteRoute = { kind: "root" } | { kind: "mode"; modeId: PaletteModeId };

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
	/** Switch value; it applies only where the mode supports the ignored scope. */
	ignoredScope: boolean;
	/** Whether the current search actually includes ignored notes. */
	includeIgnored: boolean;
	results: PaletteResult[];
	resultCount: number;
	error?: string;
	route: PaletteRoute;
}

export interface PaletteSearchSessionOptions {
	initialInput?: string;
	/** The mode to start in. Esc still leaves it for Root Search. */
	fixedMode?: FixedPaletteMode;
	sourceFile?: TFile;
	includeIgnored?: boolean;
	/** Root Search lists mode entries above the files; off for file-only palettes and tables. */
	modeEntries?: boolean;
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
	private readonly listsModes: boolean;
	private route: PaletteRoute = { kind: "root" };
	private sourceFile?: TFile;
	private readonly onStateChange?: (state: PaletteSearchState) => void;
	private state: PaletteSearchState;

	constructor(
		private readonly plugin: MyPalettePlugin,
		{
			initialInput = "",
			fixedMode,
			sourceFile,
			includeIgnored = false,
			modeEntries = false,
			onStateChange,
		}: PaletteSearchSessionOptions = {},
	) {
		this.listsModes = modeEntries;
		const definition = fixedMode ? findPaletteMode(fixedMode) : undefined;
		if (definition) this.route = { kind: "mode", modeId: definition.id };
		this.sourceFile = sourceFile;
		this.onStateChange = onStateChange;
		const parsed = this.parse(initialInput);
		this.state = {
			input: initialInput,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			ignoredScope: includeIgnored,
			includeIgnored: includeIgnored && supportsIncludeIgnored(parsed.mode),
			results: [],
			resultCount: 0,
			route: this.route,
		};
	}

	/** Enter a mode from Root Search; the input then holds only the query. */
	enterMode(modeId: PaletteModeId, query = ""): void {
		this.route = { kind: "mode", modeId };
		this.state = { ...this.state, input: query, route: this.route };
	}

	/**
	 * Leave a mode for Root Search and return the alias that should fill the
	 * input, so the mode stays one Enter away.
	 */
	returnToRoot(): string {
		const alias =
			this.route.kind === "mode"
				? paletteModeAlias(this.route.modeId, this.plugin.settings.prefixes)
				: "";
		this.route = { kind: "root" };
		this.state = { ...this.state, input: alias, route: this.route };
		return alias;
	}

	/**
	 * The input with its mode's alias, for persisting and handing the search to
	 * another palette: restoring it enters the same mode through `alias + Space`.
	 */
	get prefixedInput(): string {
		return this.rawInput(this.state.input);
	}

	get modeAlias(): string | undefined {
		return this.route.kind === "mode"
			? paletteModeAlias(this.route.modeId, this.plugin.settings.prefixes)
			: undefined;
	}

	get current(): PaletteSearchState {
		return this.state;
	}

	get input(): string {
		return this.state.input;
	}

	/**
	 * Switches the ignored-note scope for the next search. Hosts search again
	 * themselves, since the modal renders results through its own refresh.
	 */
	setIgnoredScope(value: boolean): void {
		this.state = { ...this.state, ignoredScope: value };
	}

	/** Update the note used by source-dependent modes without replacing the UI shell. */
	setSourceFile(sourceFile?: TFile): void {
		if (this.sourceFile?.path === sourceFile?.path) return;
		this.sourceFile = sourceFile;
		if (
			this.state.mode === "link" ||
			this.state.mode === "backlink" ||
			this.state.mode === "smart"
		)
			void this.search(this.state.input, { suppressHistory: true });
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
		input = this.applyDirectModeEntry(input);
		const parsed = this.parse(input);
		const includeIgnored = this.includesIgnored(parsed);
		this.state = {
			...this.state,
			input,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			includeIgnored,
			results: [],
			resultCount: 0,
			error: undefined,
			route: this.route,
		};
		this.emit();

		this.plugin.paletteOpener.rememberQuery(parsed.mode, parsed.query, this.rawInput(input));
		// History is committed when the result list receives focus. Keeping it out
		// of the search pipeline prevents typing alone from creating history.

		const delay = parsed.mode === "everything" ? this.plugin.settings.everything.debounceMs : 0;
		if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
		if (this.disposed || generation !== this.generation) return [];

		this.controller = new AbortController();
		try {
			const providerResults = await this.plugin.providers[parsed.mode].search({
				mode: parsed.mode,
				query: parsed.query,
				signal: this.controller.signal,
				everythingScope: this.scopeOf(parsed),
				includeIgnored,
				sourceFile: this.sourceFile,
			});
			const results = [...this.modeEntries(input), ...providerResults];
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
			includeIgnored: this.includesIgnored(parsed),
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
		if (this.route.kind === "root") return { raw: input, mode: "file", query: input };
		const { mode, everythingScope } = getPaletteMode(this.route.modeId);
		return { raw: input, mode, query: input, everythingScope };
	}

	/** In Root Search, `alias + Space` (typed or pasted) moves into that mode. */
	private applyDirectModeEntry(input: string): string {
		if (this.route.kind !== "root") return input;
		const entry = parseDirectModeEntry(input, this.plugin.settings.prefixes);
		if (!entry) return input;
		this.route = { kind: "mode", modeId: entry.modeId };
		return entry.query;
	}

	/** The prefixed form, so remembered input reopens in the same mode. */
	private rawInput(input: string): string {
		const alias = this.modeAlias;
		return alias === undefined ? input : `${alias} ${input}`;
	}

	private modeEntries(input: string): ModeEntryResult[] {
		if (!this.listsModes || this.route.kind !== "root") return [];
		const { prefixes } = this.plugin.settings;
		return matchPaletteModes(input, prefixes).map((definition) => ({
			id: `mode:${definition.id}`,
			mode: "mode-entry",
			modeId: definition.id,
			alias: paletteModeAlias(definition.id, prefixes),
			primary: definition.title,
			secondary: definition.subtitle,
			icon: definition.icon,
		}));
	}

	private includesIgnored(parsed: ParsedInput): boolean {
		return this.state.ignoredScope && supportsIncludeIgnored(parsed.mode);
	}

	private scopeOf(parsed: ParsedInput): EverythingScope {
		return ("everythingScope" in parsed ? parsed.everythingScope : undefined) ?? "vault";
	}

	private emit(): void {
		this.onStateChange?.(this.state);
	}
}

export interface PaletteRouteChrome {
	placeholder: string;
	chip?: { icon: string; label: string; title: string };
}

/** The input decoration shared by the modal and the workspace views. */
export function paletteRouteChrome(
	state: Pick<PaletteSearchState, "route" | "mode">,
	alias: string | undefined,
	modeEntries: boolean,
): PaletteRouteChrome {
	if (state.route.kind === "mode") {
		const definition = getPaletteMode(state.route.modeId);
		return {
			placeholder: definition.placeholder,
			chip: { icon: definition.icon, label: alias ?? "", title: definition.title },
		};
	}
	return {
		placeholder: modeEntries ? "Search files, or pick a mode" : palettePlaceholder(state.mode),
	};
}

/** Root Search headings, shown only while mode entries and files share the list. */
export function paletteSectionOf(
	state: Pick<PaletteSearchState, "route" | "results"> | undefined,
	result: PaletteResult,
): string | undefined {
	if (state?.route.kind !== "root") return undefined;
	if (!state.results.some((item) => item.mode === "mode-entry")) return undefined;
	return result.mode === "mode-entry" ? "Modes" : "Files";
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
					: mode === "tab"
						? "Search open tabs"
						: "Search files";
}
