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
	availableModes,
	findPaletteMode,
	getPaletteMode,
	matchPaletteModes,
	paletteModeAlias,
	parseDirectModeEntry,
	type PaletteModeId,
} from "src/palette/modes";
import type { ModeEntryResult } from "src/palette/results";
import { settingsEntries } from "src/settings/settingsNavigation";

export type FixedPaletteMode = Extract<
	PaletteMode,
	"file" | "link" | "backlink" | "bookmark" | "smart" | "tab"
>;

/**
 * Where a navigating palette is. Home lists mode entries above the files
 * (unless `modeEntries` is off); a mode shows one provider without a prefix.
 */
export type PaletteRoute = { kind: "home" } | { kind: "mode"; modeId: PaletteModeId };

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
	/** Switch value; it applies only where the mode supports the Obsidian-excluded scope. */
	ignoredScope: boolean;
	/** Whether the current search actually includes Obsidian-excluded files. */
	includeIgnored: boolean;
	results: PaletteResult[];
	resultCount: number;
	error?: string;
	route: PaletteRoute;
}

export interface PaletteSearchSessionOptions {
	initialInput?: string;
	/** The mode to start in. Esc still leaves it for Home. */
	fixedMode?: FixedPaletteMode;
	sourceFile?: TFile;
	includeIgnored?: boolean;
	/** Home lists mode entries above the files; off for file-only palettes and tables. */
	modeEntries?: boolean;
	onStateChange?: (state: PaletteSearchState) => void;
	/** Modal hosts refresh their own suggestion list when integration setup changes. */
	onModesChange?: () => void;
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
	private route: PaletteRoute = { kind: "home" };
	private sourceFile?: TFile;
	private readonly onStateChange?: (state: PaletteSearchState) => void;
	private state: PaletteSearchState;
	private readonly stopReadinessUpdates: () => void;

	constructor(
		private readonly plugin: MyPalettePlugin,
		{
			initialInput = "",
			fixedMode,
			sourceFile,
			includeIgnored = false,
			modeEntries = false,
			onStateChange,
			onModesChange,
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
		this.stopReadinessUpdates = plugin.integrationAvailability.subscribe(() => {
			queueMicrotask(() => {
				if (this.disposed || this.route.kind !== "home") return;
				if (onModesChange) onModesChange();
				else void this.search(this.state.input, { keepResults: true });
			});
		});
		void plugin.integrationAvailability.refresh();
	}

	/** Enter a mode from Home; the input then holds only the query. */
	enterMode(modeId: PaletteModeId, query = ""): void {
		this.route = { kind: "mode", modeId };
		this.state = { ...this.state, input: query, route: this.route };
	}

	/**
	 * Leave a mode for Home and return the alias that should fill the
	 * input, so the mode stays one Enter away.
	 */
	returnToHome(): string {
		const alias =
			this.route.kind === "mode"
				? paletteModeAlias(this.route.modeId, this.plugin.settings.modes)
				: "";
		this.route = { kind: "home" };
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
			? paletteModeAlias(this.route.modeId, this.plugin.settings.modes)
			: undefined;
	}

	get current(): PaletteSearchState {
		return this.state;
	}

	get input(): string {
		return this.state.input;
	}

	/**
	 * Switches the Obsidian-excluded scope for the next search. Hosts search again
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
		options: { suppressHistory?: boolean; keepResults?: boolean } = {},
	): Promise<PaletteResult[]> {
		if (this.disposed) return [];
		this.controller?.abort();
		const generation = ++this.generation;
		this.historyCommittedGeneration = -1;
		input = this.applyDirectModeEntry(input);
		const parsed = this.parse(input);
		const includeIgnored = this.includesIgnored(parsed);
		// Why: a background refresh (autosave, metadata change) re-runs the same
		// input; clearing the list first would flash the whole view empty. Keep the
		// old rows on screen until the new results replace them in one render.
		const keepResults = options.keepResults === true && input === this.state.input;
		this.state = {
			...this.state,
			input,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			includeIgnored,
			...(keepResults ? {} : { results: [], resultCount: 0 }),
			error: undefined,
			route: this.route,
		};
		if (!keepResults) this.emit();

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
			const settings =
				this.listsModes && this.route.kind === "home" ? settingsEntries(input) : [];
			const results = [...this.modeEntries(input), ...settings, ...providerResults];
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
			if (parsed.mode === "everything")
				this.plugin.integrationAvailability.markEverythingUnavailable();
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
		this.stopReadinessUpdates();
	}

	private parse(input: string): ParsedInput {
		if (this.route.kind === "home") return { raw: input, mode: "file", query: input };
		const { mode } = getPaletteMode(this.route.modeId);
		const everythingScope =
			mode === "everything" && this.state.ignoredScope ? "directory" : "vault";
		return { raw: input, mode, query: input, everythingScope };
	}

	/** In Home, `alias + Space` (typed or pasted) moves into that mode. */
	private applyDirectModeEntry(input: string): string {
		if (this.route.kind !== "home") return input;
		const entry = parseDirectModeEntry(
			input,
			availableModes(this.plugin.settings, this.plugin.integrationAvailability.current),
		);
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
		if (!this.listsModes || this.route.kind !== "home") return [];
		const modes = availableModes(
			this.plugin.settings,
			this.plugin.integrationAvailability.current,
		);
		return matchPaletteModes(input, modes).map((definition) => ({
			id: `mode:${definition.id}`,
			mode: "mode-entry",
			modeId: definition.id,
			alias: paletteModeAlias(definition.id, modes),
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

/** Home headings, shown only while mode entries and files share the list. */
export function paletteSectionOf(
	state: Pick<PaletteSearchState, "route" | "results"> | undefined,
	result: PaletteResult,
): string | undefined {
	if (state?.route.kind !== "home") return undefined;
	if (!state.results.some((item) => item.mode === "mode-entry" || item.mode === "settings-entry"))
		return undefined;
	if (result.mode === "settings-entry") return "Settings";
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
						: mode === "plugin"
							? "Search installed plugins"
							: mode === "snippet"
								? "Search CSS snippets"
								: "Search files";
}
