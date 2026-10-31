import { isAuditKind } from "src/audit/vaultAudit";
import type { PaletteModeId } from "src/palette/modes";
import type {
	AuditSettings,
	IntegrationSettings,
	ModeSettingsMap,
	MyPaletteSettings,
	PaletteSurface,
	ReturnToHomeSeconds,
} from "src/settings/model";
import { normalizeHotkeys } from "src/ui/hotkeys";
import {
	DEFAULT_BLANK_FILE_SORT_PRIORITIES,
	DEFAULT_SETTINGS,
	FILE_SORT_PRIORITIES,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	normalizeFileSortPriorities,
} from "src/settings/model";

const PREVIOUS_DEFAULT_SEARCH_HISTORY_DELAY_MS = 3_000;
// スキーマ 12 で既定を、入力を遅らせる保存から操作だけの履歴へ変えた。以後のスキーマの変更で、
// ユーザーが明示的に選んだ3秒の遅延を読み替えてはいけない。
const SEARCH_HISTORY_ACTION_ONLY_SCHEMA_VERSION = 12;

/**
 * `data.json` は信頼できない保存済みの入力。正規化を Obsidian の設定 UI から分けておくと、
 * 移行の契約を純粋で、テストできる形に保てる。
 */

export function bounded(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

export function extensions(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.everything.vaultExtensions];
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim().replace(/^\./, "").toLocaleLowerCase())
		.filter((item) => /^[a-z0-9_-]+$/.test(item));
	return [...new Set(normalized)];
}

export function excludedFolders(value: unknown): string[] {
	if (typeof value === "string") value = value.split(/[\r\n,]+/);
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.file.excludedFolders];
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, ""))
		.filter((item) => item.length > 0 && item !== "/" && !item.startsWith(".."));
	return [...new Set(normalized)];
}

export function mergeSettings(data: unknown): MyPaletteSettings {
	const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const rawFile = (source.file ?? {}) as Record<string, unknown>;
	const rawEverything = (source.everything ?? {}) as Record<string, unknown>;
	const rawSearchHistory =
		source.searchHistory && typeof source.searchHistory === "object"
			? (source.searchHistory as Record<string, unknown>)
			: {};
	const storedSchemaVersion =
		typeof source.schemaVersion === "number" ? source.schemaVersion : undefined;
	const migratedSearchHistoryDelay =
		// 以前の既定値は移行の対象として扱い、新しいスキーマで保存された明示的な遅延は残す。
		(storedSchemaVersion === undefined ||
			storedSchemaVersion < SEARCH_HISTORY_ACTION_ONLY_SCHEMA_VERSION) &&
		rawSearchHistory.addDelayMs === PREVIOUS_DEFAULT_SEARCH_HISTORY_DELAY_MS
			? DEFAULT_SETTINGS.searchHistory.addDelayMs
			: rawSearchHistory.addDelayMs;
	const rawSortPriorities = rawFile.sortPriorities;
	const legacySortPriorities = normalizeFileSortPriorities(rawSortPriorities);
	const legacyBlankSortPriorities = normalizeFileSortPriorities(
		rawSortPriorities,
		DEFAULT_BLANK_FILE_SORT_PRIORITIES,
	);
	// 古い設定は両方の検索状態を制御していた。各枝にコピーし、アップグレードで空の入力と
	// 入力した検索語のどちらの並び順も、黙って変わらないようにする。
	const sortPriorities =
		rawSortPriorities &&
		typeof rawSortPriorities === "object" &&
		!Array.isArray(rawSortPriorities)
			? {
					blank: normalizeFileSortPriorities(
						(rawSortPriorities as Record<string, unknown>).blank,
						DEFAULT_BLANK_FILE_SORT_PRIORITIES,
					),
					input: normalizeFileSortPriorities(
						(rawSortPriorities as Record<string, unknown>).input,
					),
				}
			: { blank: [...legacyBlankSortPriorities], input: [...legacySortPriorities] };
	const demotedPriorFolders = excludedFolders(rawFile.demotedPriorFolders);
	// 既存のフォルダーのルールは、@prior から切り離した後も効き続けるべき。一度だけ移行し、
	// 以後の編集で独立した基準を無効にしたり位置を変えたりできるようにする。
	if ((storedSchemaVersion ?? 0) < 18 && demotedPriorFolders.length > 0) {
		for (const state of ["blank", "input"] as const) {
			if (!sortPriorities[state].includes(FILE_SORT_PRIORITIES.lowerPriorFolders)) {
				sortPriorities[state].unshift(FILE_SORT_PRIORITIES.lowerPriorFolders);
			}
		}
	}

	return {
		...DEFAULT_SETTINGS,
		hotkeys: normalizeHotkeys(source.hotkeys),
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		showLog: typeof source.showLog === "boolean" ? source.showLog : false,
		paletteDisplay: normalizePaletteDisplay(source),
		home: { returnAfterSeconds: normalizeReturnToHome(source) },
		openExternalMarkdownInObsidian:
			typeof source.openExternalMarkdownInObsidian === "boolean"
				? source.openExternalMarkdownInObsidian
				: true,
		focusExistingTab:
			typeof source.focusExistingTab === "boolean" ? source.focusExistingTab : true,
		searchHistory: {
			enabled:
				typeof rawSearchHistory.enabled === "boolean"
					? rawSearchHistory.enabled
					: DEFAULT_SETTINGS.searchHistory.enabled,
			addDelayMs: bounded(
				migratedSearchHistoryDelay,
				DEFAULT_SETTINGS.searchHistory.addDelayMs,
				SETTING_LIMITS.searchHistory.addDelayMs.min,
				SETTING_LIMITS.searchHistory.addDelayMs.max,
			),
			daysToKeep: bounded(
				rawSearchHistory.daysToKeep,
				DEFAULT_SETTINGS.searchHistory.daysToKeep,
				SETTING_LIMITS.searchHistory.daysToKeep.min,
				SETTING_LIMITS.searchHistory.daysToKeep.max,
			),
		},
		modes: normalizeModes(source),
		integrations: normalizeIntegrations(source),
		file: {
			sortPriorities,
			excludedFolders: excludedFolders(rawFile.excludedFolders),
			demotedPriorFolders,
			foldKana:
				typeof rawFile.foldKana === "boolean"
					? rawFile.foldKana
					: DEFAULT_SETTINGS.file.foldKana,
			openableFilesOnly:
				typeof rawFile.openableFilesOnly === "boolean"
					? rawFile.openableFilesOnly
					: DEFAULT_SETTINGS.file.openableFilesOnly,
		},
		everything: {
			backend: rawEverything.backend === "http" ? "http" : "es",
			esPath:
				typeof rawEverything.esPath === "string" && rawEverything.esPath.trim()
					? rawEverything.esPath.trim()
					: DEFAULT_SETTINGS.everything.esPath,
			httpUrl:
				typeof rawEverything.httpUrl === "string" && rawEverything.httpUrl.trim()
					? rawEverything.httpUrl.trim()
					: DEFAULT_SETTINGS.everything.httpUrl,
			username: typeof rawEverything.username === "string" ? rawEverything.username : "",
			password: typeof rawEverything.password === "string" ? rawEverything.password : "",
			maxResults: bounded(
				rawEverything.maxResults,
				DEFAULT_SETTINGS.everything.maxResults,
				SETTING_LIMITS.everything.maxResults.min,
				SETTING_LIMITS.everything.maxResults.max,
			),
			debounceMs: bounded(
				rawEverything.debounceMs,
				DEFAULT_SETTINGS.everything.debounceMs,
				SETTING_LIMITS.everything.debounceMs.min,
				SETTING_LIMITS.everything.debounceMs.max,
			),
			requestTimeoutMs: bounded(
				rawEverything.requestTimeoutMs,
				DEFAULT_SETTINGS.everything.requestTimeoutMs,
				SETTING_LIMITS.everything.requestTimeoutMs.min,
				SETTING_LIMITS.everything.requestTimeoutMs.max,
			),
			vaultExtensions: extensions(rawEverything.vaultExtensions),
		},
		audit: normalizeAudit(source),
	};
}

function normalizeAudit(source: Record<string, unknown>): AuditSettings {
	const raw =
		source.audit && typeof source.audit === "object"
			? (source.audit as Record<string, unknown>)
			: {};
	// Why: 廃止された除外リスト、アーカイブのフォルダー、スイッチはここで捨てる。Vault 監査は今では
	// プラグイン全体の除外に従い、MOC だけのノートは常に空として数えるため。
	return { kind: isAuditKind(raw.kind) ? raw.kind : DEFAULT_SETTINGS.audit.kind };
}

// スキーマ 20 は「最後の入力を覚える」を、タイムアウトに置き換えた。off は即座、on は既定を意味した。
// スキーマ 21 で launcher.popToRootAfterSeconds から home.returnAfterSeconds へ移した。
const RETURN_TO_HOME_OPTIONS: readonly ReturnToHomeSeconds[] = [0, 30, 60, 90];

function normalizeReturnToHome(source: Record<string, unknown>): ReturnToHomeSeconds {
	const home = source.home as Record<string, unknown> | undefined;
	const legacy = source.launcher as Record<string, unknown> | undefined;
	for (const stored of [home?.returnAfterSeconds, legacy?.popToRootAfterSeconds]) {
		if (RETURN_TO_HOME_OPTIONS.includes(stored as ReturnToHomeSeconds))
			return stored as ReturnToHomeSeconds;
	}
	if (typeof source.rememberLastInput !== "boolean")
		return DEFAULT_SETTINGS.home.returnAfterSeconds;
	return source.rememberLastInput ? DEFAULT_SETTINGS.home.returnAfterSeconds : 0;
}

// スイッチがないか真偽値でない場合、連携は on のままになる。スイッチができる前の挙動と同じ。
function normalizeIntegrations(source: Record<string, unknown>): IntegrationSettings {
	const raw = (source.integrations ?? {}) as Record<string, Record<string, unknown> | undefined>;
	const enabled = (key: keyof IntegrationSettings) => {
		const value = raw[key]?.enabled;
		return { enabled: typeof value === "boolean" ? value : true };
	};
	return { everything: enabled("everything"), smartConnections: enabled("smartConnections") };
}

// スキーマ 19 より前は、設定できる2つのエイリアスが末尾に空白を付けた `prefixes` として保存されていた。
// まだ独自のエイリアスを持たないモードの、代わりの値として読む。
const LEGACY_PREFIX_KEYS: Partial<Record<PaletteModeId, "command" | "everything">> = {
	commands: "command",
	everything: "everything",
};

function normalizeModes(source: Record<string, unknown>): ModeSettingsMap {
	const rawModes = (source.modes ?? {}) as Record<string, unknown>;
	const rawPrefixes = (source.prefixes ?? {}) as Record<string, unknown>;
	const modeIds = Object.keys(DEFAULT_SETTINGS.modes) as PaletteModeId[];
	const modes = Object.fromEntries(
		modeIds.map((id) => {
			const legacyEverything = rawModes["everything-all"] as
				| Record<string, unknown>
				| undefined;
			const rawMode = (rawModes[id] ??
				(id === "everything" ? legacyEverything : undefined) ??
				{}) as Record<string, unknown>;
			const legacyKey = LEGACY_PREFIX_KEYS[id];
			const legacyAlias = legacyKey ? rawPrefixes[legacyKey] : undefined;
			const stored = [rawMode.alias, legacyAlias].find(
				(value): value is string => typeof value === "string" && value.trim() !== "",
			);
			// 空のエイリアスは入力できないので、既定の値に戻す。
			let enabled = typeof rawMode.enabled === "boolean" ? rawMode.enabled : true;
			// 古い Everything の2つの項目のどちらかが有効なら、アップグレード後も統合したモードは有効のまま。
			if (
				id === "everything" &&
				(Number(source.schemaVersion) || 0) < 22 &&
				legacyEverything?.enabled === true
			)
				enabled = true;
			return [id, { alias: (stored ?? DEFAULT_SETTINGS.modes[id].alias).trim(), enabled }];
		}),
	) as ModeSettingsMap;
	// 新しいモードが、ユーザーがすでに別のモードへ割り当てたエイリアスを奪ってはいけない。
	if (!rawModes.notes) {
		modes.notes.alias = unusedAlias("n", "notes", "notes", modeIds, modes);
	}
	// プラグインは他のモードより後に来た。保存された独自のエイリアスがぶつかるなら、
	// 新しいモードを空いている代わりのエイリアスへ移す。
	if (!rawModes.plugins) {
		modes.plugins.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.plugins.alias,
			"plugins",
			"plugins",
			modeIds,
			modes,
		);
	}
	// スニペットはプラグインと一緒に来た。`sn` は `sc` と先頭の文字が同じだが、エイリアスは
	// 「エイリアス + Space」で照合するので、まったく同じエイリアスだけが衝突する。
	if (!rawModes.snippets) {
		modes.snippets.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.snippets.alias,
			"snippets",
			"snippets",
			modeIds,
			modes,
		);
	}
	// タグは後から来た。`tg` が空いていなければ、空いている代わりのエイリアスへ移す。
	if (!rawModes.tags) {
		modes.tags.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.tags.alias,
			"tags",
			"tags",
			modeIds,
			modes,
		);
	}
	// プロパティは最後に来た。`pr` は `p`(プラグイン)と先頭の文字が同じだが、
	// エイリアスは「エイリアス + Space」で照合するので問題ない。
	if (!rawModes.properties) {
		modes.properties.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.properties.alias,
			"properties",
			"properties",
			modeIds,
			modes,
		);
	}
	// Vault 監査はプロパティの後に来た。ユーザーがすでに別のモードへ `a` を打っているかもしれない。
	if (!rawModes.audit) {
		modes.audit.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.audit.alias,
			"audit",
			"audit",
			modeIds,
			modes,
		);
	}
	// 見出しは Vault 監査より後に来た。`h` はすでに別のモードへ割り当てられているかもしれない。
	if (!rawModes.headings) {
		modes.headings.alias = unusedAlias(
			DEFAULT_SETTINGS.modes.headings.alias,
			"headings",
			"headings",
			modeIds,
			modes,
		);
	}
	return modes;
}

function unusedAlias(
	preferred: string,
	fallback: string,
	modeId: PaletteModeId,
	modeIds: readonly PaletteModeId[],
	modes: ModeSettingsMap,
): string {
	const taken = new Set(
		modeIds.filter((id) => id !== modeId).map((id) => modes[id].alias.toLocaleLowerCase()),
	);
	if (!taken.has(preferred.toLocaleLowerCase())) return preferred;
	for (let suffix = 1; ; suffix++) {
		const candidate = suffix === 1 ? fallback : `${fallback}${suffix}`;
		if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
	}
}

function normalizePaletteDisplay(
	source: Record<string, unknown>,
): MyPaletteSettings["paletteDisplay"] {
	const raw =
		source.paletteDisplay && typeof source.paletteDisplay === "object"
			? (source.paletteDisplay as Record<string, unknown>)
			: {};
	// Why: アップグレードのとき、以前の共通の設定を各画面の中で保つ。
	const legacyHighlight =
		typeof source.highlightSearchMatches === "boolean" ? source.highlightSearchMatches : true;
	const normalize = (surface: PaletteSurface) => {
		const branch = raw[surface];
		const highlight =
			branch && typeof branch === "object" && "highlightSearchMatches" in branch
				? branch.highlightSearchMatches
				: undefined;
		return {
			highlightSearchMatches: typeof highlight === "boolean" ? highlight : legacyHighlight,
		};
	};
	return { table: normalize("table"), view: normalize("view"), palette: normalize("palette") };
}
