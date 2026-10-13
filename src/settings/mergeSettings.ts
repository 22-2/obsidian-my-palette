import type { PaletteModeId } from "src/palette/modes";
import type {
	IntegrationSettings,
	ModeSettingsMap,
	MyPaletteSettings,
	PaletteSurface,
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
// Schema 12 changed the default from delayed input to action-only history;
// later schema bumps must not reinterpret a user's explicit 3-second delay.
const SEARCH_HISTORY_ACTION_ONLY_SCHEMA_VERSION = 12;

/**
 * `data.json` is untrusted persisted input. Keeping normalization separate from
 * the Obsidian settings UI lets the migration contract stay pure and testable.
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
		// Treat the previous default as a migration value, while preserving an
		// explicit delay in settings written by the new schema.
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
	// The old setting controlled both query states. Copy it into each branch so
	// upgrading does not silently change either empty or typed search ordering.
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
	// Existing folder rules should stay effective after decoupling from @prior.
	// Migrate once so later edits can disable or reposition the independent criterion.
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
		rememberLastInput:
			typeof source.rememberLastInput === "boolean" ? source.rememberLastInput : false,
		openExternalMarkdownInObsidian:
			typeof source.openExternalMarkdownInObsidian === "boolean"
				? source.openExternalMarkdownInObsidian
				: true,
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
		},
		everything: {
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
	};
}

// A missing or non-boolean switch means the integration stays on, as it did before switches existed.
function normalizeIntegrations(source: Record<string, unknown>): IntegrationSettings {
	const raw = (source.integrations ?? {}) as Record<string, Record<string, unknown> | undefined>;
	const enabled = (key: keyof IntegrationSettings) => ({
		enabled: typeof raw[key]?.enabled === "boolean" ? (raw[key]?.enabled as boolean) : true,
	});
	return { everything: enabled("everything"), smartConnections: enabled("smartConnections") };
}

// Before schema 19 the two configurable aliases were stored as `prefixes` with a trailing space.
// Read them as the fallback for a mode that has no alias of its own yet.
const LEGACY_PREFIX_KEYS: Partial<Record<PaletteModeId, "command" | "everything">> = {
	commands: "command",
	everything: "everything",
};

function normalizeModes(source: Record<string, unknown>): ModeSettingsMap {
	const rawModes = (source.modes ?? {}) as Record<string, unknown>;
	const rawPrefixes = (source.prefixes ?? {}) as Record<string, unknown>;
	const modeIds = Object.keys(DEFAULT_SETTINGS.modes) as PaletteModeId[];
	return Object.fromEntries(
		modeIds.map((id) => {
			const rawMode = (rawModes[id] ?? {}) as Record<string, unknown>;
			const legacyKey = LEGACY_PREFIX_KEYS[id];
			const legacyAlias = legacyKey ? rawPrefixes[legacyKey] : undefined;
			const stored = [rawMode.alias, legacyAlias].find(
				(value): value is string => typeof value === "string" && value.trim() !== "",
			);
			// An empty alias could never be typed; fall back to the default instead.
			const enabled = typeof rawMode.enabled === "boolean" ? rawMode.enabled : true;
			return [id, { alias: (stored ?? DEFAULT_SETTINGS.modes[id].alias).trim(), enabled }];
		}),
	) as ModeSettingsMap;
}

function normalizePaletteDisplay(
	source: Record<string, unknown>,
): MyPaletteSettings["paletteDisplay"] {
	const raw =
		source.paletteDisplay && typeof source.paletteDisplay === "object"
			? (source.paletteDisplay as Record<string, unknown>)
			: {};
	// Why: preserve the previous shared preference in each surface when upgrading.
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
