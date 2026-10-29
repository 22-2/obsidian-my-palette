import type { TFile } from "obsidian";
import { auditPlaceholder } from "src/audit/auditKinds";
import type { AuditKind } from "src/audit/vaultAudit";
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
	isModeIntegrationOn,
	isModeIntegrationReady,
	matchPaletteModes,
	paletteModeAlias,
	parseDirectModeEntry,
	type PaletteModeId,
} from "src/palette/modes";
import type { ModeEntryResult } from "src/palette/results";
import { t } from "src/i18n";
import { ICONS } from "src/ui/icons";
import {
	isPaletteSortableMode,
	sortPaletteResults,
	type PaletteSort,
	type PaletteSortMode,
} from "src/palette/paletteSorting";

const HOME_MODE_IDS: readonly PaletteModeId[] = ["notes", "commands", "bookmarks", "tags"];

export type FixedPaletteMode = Extract<
	PaletteMode,
	"file" | "link" | "backlink" | "bookmark" | "smart" | "tab"
>;

/**
 * 移動できるパレットの現在位置。Home は、ファイルの上にモードの一覧を出す(`modeEntries` が off でない限り)。
 * モードは、接頭辞なしで1つのプロバイダーを表示する。
 */
export type PaletteRoute =
	| { kind: "home" }
	| { kind: "other" }
	| { kind: "mode"; modeId: PaletteModeId };

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
	/** スイッチの値。モードが Obsidian の除外ファイルの範囲に対応している場所でだけ効く。 */
	ignoredScope: boolean;
	/** 現在の検索が実際に Obsidian の除外ファイルを含むかどうか。 */
	includeIgnored: boolean;
	results: PaletteResult[];
	resultCount: number;
	hasModeEntries: boolean;
	error?: string;
	/** プロバイダーの検索が進行中かどうか。モードによらず、結果が届くまで true。 */
	loading: boolean;
	route: PaletteRoute;
}

export interface PaletteSearchSessionOptions {
	initialInput?: string;
	/** 最初に入るモード。Esc を押すと、そこから Home に戻る。 */
	fixedMode?: FixedPaletteMode;
	sourceFile?: TFile;
	/** 一緒に編集するノート。プロパティのモードだけが読む。 */
	sourceFiles?: readonly TFile[];
	includeIgnored?: boolean;
	/** Home はファイルの上にモードの一覧を出す。ファイルだけのパレットと表では off にする。 */
	modeEntries?: boolean;
	onStateChange?: (state: PaletteSearchState) => void;
	/** モーダルのホストは、連携の設定が変わったときに、自分の候補の一覧を更新する。 */
	onModesChange?: () => void;
}

/**
 * パレットの入力からプロバイダーへの流れを、UI のホストとは独立に持つ。モーダルと
 * 常駐のワークスペースビューは、キャンセル・履歴・古い結果の扱いを共有しなければならない。
 * その規則をここに置くことで、2つの外枠の検索の挙動が少しずつ食い違うのを防ぐ。
 */
export class PaletteSearchSession {
	private generation = 0;
	private controller?: AbortController;
	private historyCommittedGeneration = -1;
	private disposed = false;
	private readonly listsModes: boolean;
	private route: PaletteRoute = { kind: "home" };
	private sourceFile?: TFile;
	private readonly sourceFiles?: readonly TFile[];
	private readonly onStateChange?: (state: PaletteSearchState) => void;
	private state: PaletteSearchState;
	private readonly stopReadinessUpdates: () => void;
	private readonly sortingByMode = new Map<PaletteSortMode, PaletteSort>();
	private unsortedResults: PaletteResult[] = [];

	constructor(
		private readonly plugin: MyPalettePlugin,
		{
			initialInput = "",
			fixedMode,
			sourceFile,
			sourceFiles,
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
		this.sourceFiles = sourceFiles;
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
			hasModeEntries: false,
			loading: false,
			route: this.route,
		};
		this.stopReadinessUpdates = plugin.integrationAvailability.subscribe(() => {
			queueMicrotask(() => {
				if (this.disposed || this.route.kind === "mode") return;
				if (onModesChange) onModesChange();
				else void this.search(this.state.input, { keepResults: true });
			});
		});
		void plugin.integrationAvailability.refresh();
	}

	/** Home からモードに入る。入力にはクエリだけが残る。 */
	enterMode(modeId: PaletteModeId | "other", query = ""): void {
		this.route = modeId === "other" ? { kind: "other" } : { kind: "mode", modeId };
		this.state = { ...this.state, input: query, route: this.route };
	}

	/** モードを抜け、空の Home に戻る。 */
	returnToHome(): void {
		this.route = { kind: "home" };
		this.state = { ...this.state, input: "", route: this.route };
	}

	/**
	 * モードのエイリアスを付けた入力。保存する場合や、ほかのパレットへ検索を渡す場合に使う。
	 * 復元すると、`エイリアス + Space` で同じモードに入る。
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

	getSorting(): PaletteSort | undefined {
		return isPaletteSortableMode(this.state.mode)
			? this.sortingByMode.get(this.state.mode)
			: undefined;
	}

	/** 現在のモードだけに並べ替えを適用する。未指定なら provider 本来の順序に戻す。 */
	setSorting(sorting?: PaletteSort): void {
		const mode = this.state.mode;
		if (!isPaletteSortableMode(mode)) return;
		if (sorting) this.sortingByMode.set(mode, sorting);
		else this.sortingByMode.delete(mode);
		this.state = {
			...this.state,
			results: sortPaletteResults(this.plugin.app, this.unsortedResults, sorting),
		};
		this.emit();
	}

	/**
	 * 次の検索で使う、Obsidian の除外ファイルの範囲を切り替える。モーダルは自分の更新で結果を描くので、
	 * ホストが自分で検索をやり直す。
	 */
	setIgnoredScope(value: boolean): void {
		this.state = { ...this.state, ignoredScope: value };
	}

	/** UI の外枠を作り直さずに、元のノートに依存するモードが使うノートを更新する。 */
	setSourceFile(sourceFile?: TFile): void {
		if (this.sourceFile?.path === sourceFile?.path) return;
		this.sourceFile = sourceFile;
		if (
			this.state.mode === "link" ||
			this.state.mode === "backlink" ||
			this.state.mode === "smart" ||
			this.state.mode === "property"
		)
			void this.search(this.state.input);
	}

	/** プロバイダーの新しい検索を始め、古い入力の結果は捨てる。 */
	async search(
		input = this.state.input,
		options: { keepResults?: boolean } = {},
	): Promise<PaletteResult[]> {
		if (this.disposed) return [];
		this.controller?.abort();
		const generation = ++this.generation;
		this.historyCommittedGeneration = -1;
		input = this.applyDirectModeEntry(input);
		const parsed = this.parse(input);
		const includeIgnored = this.includesIgnored(parsed);
		// Why: バックグラウンドの再読み込み(自動保存、メタデータの変更)は同じ入力を再実行する。
		// 先に一覧を空にすると、表示全体が一瞬空になってしまう。新しい結果が1回の描画で置き換えるまで、
		// 古い行を画面に残す。
		const keepResults = options.keepResults === true && input === this.state.input;
		if (!keepResults) this.unsortedResults = [];
		this.state = {
			...this.state,
			input,
			query: parsed.query,
			mode: parsed.mode,
			everythingScope: this.scopeOf(parsed),
			includeIgnored,
			...(keepResults ? {} : { results: [], resultCount: 0, hasModeEntries: false }),
			error: undefined,
			loading: true,
			route: this.route,
		};
		this.emit();

		// 履歴は、結果の一覧がフォーカスを受け取ったときに記録する。検索の流れから外しておくと、
		// 入力するだけでは履歴が作られないようにできる。

		const delay = parsed.mode === "everything" ? this.plugin.settings.everything.debounceMs : 0;
		if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
		if (this.disposed || generation !== this.generation) return [];

		this.controller = new AbortController();
		try {
			const providerResults =
				this.route.kind === "other"
					? []
					: await this.plugin.providers[parsed.mode].search({
							mode: parsed.mode,
							query: parsed.query,
							signal: this.controller.signal,
							everythingScope: this.scopeOf(parsed),
							includeIgnored,
							sourceFile: this.sourceFile,
							sourceFiles: this.sourceFiles,
						});
			if (this.disposed || generation !== this.generation) return [];
			this.unsortedResults = [...this.modeEntries(input), ...providerResults];
			const results = sortPaletteResults(
				this.plugin.app,
				this.unsortedResults,
				isPaletteSortableMode(parsed.mode)
					? this.sortingByMode.get(parsed.mode)
					: undefined,
			);
			if (this.disposed || generation !== this.generation) return [];
			this.state = {
				...this.state,
				results,
				resultCount: results.length,
				hasModeEntries: results.some((item) => item.mode === "mode-entry"),
				error: undefined,
				loading: false,
			};
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
				hasModeEntries: false,
				error: error instanceof Error ? error.message : String(error),
				loading: false,
			};
			this.emit();
			return [];
		}
	}

	setInput(input: string): void {
		void this.search(input);
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
		if (this.route.kind !== "mode") return { raw: input, mode: "file", query: input };
		const { mode } = getPaletteMode(this.route.modeId);
		const everythingScope =
			mode === "everything" && this.state.ignoredScope ? "directory" : "vault";
		return { raw: input, mode, query: input, everythingScope };
	}

	/** Home では、「エイリアス + Space」(打ち込んだものでも貼り付けたものでも)がそのモードに入る。 */
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

	/** 接頭辞付きの形。覚えた入力が同じモードで開き直せるようにする。 */
	private rawInput(input: string): string {
		const alias = this.modeAlias;
		return alias === undefined ? input : `${alias} ${input}`;
	}

	private modeEntries(input: string): ModeEntryResult[] {
		if (!this.listsModes || this.route.kind === "mode") return [];
		const { settings, integrationAvailability } = this.plugin;
		const modes = Object.fromEntries(
			Object.entries(settings.modes).map(([id, mode]) => [
				id,
				{
					...mode,
					enabled: mode.enabled && isModeIntegrationOn(id as PaletteModeId, settings),
				},
			]),
		) as typeof settings.modes;
		const matched = matchPaletteModes(input, modes);
		const definitions =
			this.route.kind === "other"
				? matched.filter(({ id }) => !HOME_MODE_IDS.includes(id))
				: input.trim()
					? matched
					: HOME_MODE_IDS.flatMap((id) => matched.filter((mode) => mode.id === id));
		const entries: ModeEntryResult[] = definitions.map((definition) => ({
			id: `mode:${definition.id}`,
			mode: "mode-entry",
			modeId: definition.id,
			unavailable: !isModeIntegrationReady(definition.id, integrationAvailability.current),
			alias: paletteModeAlias(definition.id, modes),
			primary: definition.title,
			secondary: definition.subtitle,
			icon: definition.icon,
		}));
		if (
			this.route.kind === "home" &&
			!input.trim() &&
			matched.some(({ id }) => !HOME_MODE_IDS.includes(id))
		)
			entries.push({
				id: "mode:other",
				mode: "mode-entry",
				modeId: "other",
				alias: "",
				primary: t("mode.other.title"),
				secondary: "",
				icon: ICONS.expand,
			});
		return entries;
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

/** モーダルと常駐のワークスペースビューが共有する、入力欄の装飾。 */
export function paletteRouteChrome(
	state: Pick<PaletteSearchState, "route" | "mode">,
	alias: string | undefined,
	modeEntries: boolean,
	auditKind?: AuditKind,
): PaletteRouteChrome {
	if (state.route.kind === "mode") {
		const definition = getPaletteMode(state.route.modeId);
		return {
			// Why: Vault 監査は、オプションのメニューで種類を切り替えるので、入力欄にその名前を出す。
			placeholder:
				definition.id === "audit" && auditKind
					? auditPlaceholder(auditKind)
					: definition.placeholder,
			chip: { icon: definition.icon, label: alias ?? "", title: definition.title },
		};
	}
	if (state.route.kind === "other")
		return {
			placeholder: t("mode.other.placeholder"),
			chip: {
				icon: ICONS.expand,
				label: t("mode.other.title"),
				title: t("mode.other.title"),
			},
		};
	return {
		placeholder: modeEntries
			? t("palette.placeholder.homeSearch")
			: palettePlaceholder(state.mode),
	};
}

/** Home の見出し。モードの項目とファイルが同じ一覧にあるときだけ表示する。 */
export function paletteSectionOf(
	state: Pick<PaletteSearchState, "route" | "hasModeEntries"> | undefined,
	result: PaletteResult,
): string | undefined {
	if (result.mode === "property") return result.section;
	if (state?.route.kind !== "home") return undefined;
	if (!state.hasModeEntries) return undefined;
	return result.mode === "mode-entry" ? t("palette.section.modes") : t("palette.section.files");
}

export function palettePlaceholder(mode: PaletteMode): string {
	return mode === "link"
		? t("palette.placeholder.link")
		: mode === "backlink"
			? t("palette.placeholder.backlink")
			: mode === "bookmark"
				? t("palette.placeholder.bookmark")
				: mode === "smart"
					? t("palette.placeholder.smart")
					: mode === "tab"
						? t("palette.placeholder.tab")
						: mode === "plugin"
							? t("palette.placeholder.plugin")
							: mode === "snippet"
								? t("palette.placeholder.snippet")
								: mode === "property"
									? t("palette.placeholder.property")
									: mode === "tag"
										? t("palette.placeholder.tag")
										: t("palette.placeholder.files");
}
