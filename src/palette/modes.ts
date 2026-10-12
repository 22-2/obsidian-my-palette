import type { Prefixes } from "src/palette/inputParser";
import type { EverythingScope, PaletteMode } from "src/palette/results";

export type PaletteModeId =
	| "commands"
	| "everything"
	| "everything-all"
	| "outlinks"
	| "backlinks"
	| "bookmarks"
	| "smart"
	| "tabs";

export interface PaletteModeDefinition {
	id: PaletteModeId;
	mode: Exclude<PaletteMode, "file">;
	everythingScope?: EverythingScope;
	title: string;
	subtitle: string;
	icon: string;
	placeholder: string;
}

/** Root Search lists the modes in this order when the input is empty. */
export const PALETTE_MODES: readonly PaletteModeDefinition[] = [
	{
		id: "commands",
		mode: "command",
		title: "Run Command",
		subtitle: "Obsidian",
		icon: "square-terminal",
		placeholder: "Search commands",
	},
	{
		id: "everything",
		mode: "everything",
		everythingScope: "vault",
		title: "Search Vault Notes",
		subtitle: "Everything",
		icon: "search",
		placeholder: "Search vault notes with Everything",
	},
	{
		id: "everything-all",
		mode: "everything",
		everythingScope: "directory",
		title: "Search All Files in Vault",
		subtitle: "Everything",
		icon: "folder-search",
		placeholder: "Search all files in the vault with Everything",
	},
	{
		id: "outlinks",
		mode: "link",
		title: "Search Outgoing Links",
		subtitle: "Current note",
		icon: "links-going-out",
		placeholder: "Search links in the active note",
	},
	{
		id: "backlinks",
		mode: "backlink",
		title: "Search Backlinks",
		subtitle: "Current note",
		icon: "links-coming-in",
		placeholder: "Search backlinks to the active note",
	},
	{
		id: "bookmarks",
		mode: "bookmark",
		title: "Search Bookmarks",
		subtitle: "Obsidian",
		icon: "bookmark",
		placeholder: "Search bookmarks",
	},
	{
		id: "smart",
		mode: "smart",
		title: "Search Related Notes",
		subtitle: "Smart Connections",
		icon: "sparkles",
		placeholder: "Search Smart Connections",
	},
	{
		id: "tabs",
		mode: "tab",
		title: "Switch Tab",
		subtitle: "Workspace",
		icon: "panel-top",
		placeholder: "Search open tabs",
	},
];

export function getPaletteMode(id: PaletteModeId): PaletteModeDefinition {
	const definition = PALETTE_MODES.find((mode) => mode.id === id);
	if (!definition) throw new Error(`Unknown palette mode: ${id}`);
	return definition;
}

export function findPaletteMode(
	mode: PaletteMode,
	everythingScope: EverythingScope = "vault",
): PaletteModeDefinition | undefined {
	return PALETTE_MODES.find(
		(definition) =>
			definition.mode === mode &&
			(definition.mode !== "everything" || definition.everythingScope === everythingScope),
	);
}

/** Aliases are the old prefixes without their trailing space. */
export function paletteModeAlias(id: PaletteModeId, prefixes: Prefixes): string {
	switch (id) {
		case "commands":
			return prefixes.command.trim();
		case "everything":
			return prefixes.everything.trim();
		case "everything-all":
			return "esdir";
		case "outlinks":
			return "o";
		case "backlinks":
			return "b";
		case "bookmarks":
			return "bk";
		case "smart":
			return "sc";
		case "tabs":
			return "t";
	}
}

/** Modes whose alias the settings can change. */
export type ConfigurableModeId = Extract<PaletteModeId, "commands" | "everything">;

/**
 * Checks an alias typed in the settings. Aliases are matched as `alias + Space`,
 * so `e` and `esdir` can coexist; only an identical alias would be ambiguous.
 */
export function validateModeAlias(
	id: ConfigurableModeId,
	value: string,
	prefixes: Prefixes,
): string | undefined {
	const alias = value.trim().toLocaleLowerCase();
	if (!alias) return "Enter an alias.";
	if (/\s/.test(alias)) return "Aliases cannot contain spaces.";
	const taken = [
		...PALETTE_MODES.filter((mode) => mode.id !== id).map((mode) =>
			paletteModeAlias(mode.id, prefixes),
		),
		// `es` stays a hidden alias of the vault Everything search.
		...(id === "everything" ? [] : ["es"]),
	].map((other) => other.toLocaleLowerCase());
	if (taken.includes(alias)) return `"${value.trim()}" is already used by another mode.`;
	return undefined;
}

/**
 * Mode entries for Root Search: an exact alias first, then alias prefixes, then
 * titles whose words start with every typed term. An empty input lists all modes.
 */
export function matchPaletteModes(input: string, prefixes: Prefixes): PaletteModeDefinition[] {
	const query = input.trim().toLocaleLowerCase();
	if (!query) return [...PALETTE_MODES];
	const rank = (definition: PaletteModeDefinition): number => {
		const alias = paletteModeAlias(definition.id, prefixes).toLocaleLowerCase();
		if (alias === query) return 0;
		if (alias.startsWith(query)) return 1;
		return matchesTitleWords(definition, query) ? 2 : -1;
	};
	return PALETTE_MODES.map((definition) => ({ definition, rank: rank(definition) }))
		.filter(({ rank }) => rank >= 0)
		.sort((a, b) => a.rank - b.rank)
		.map(({ definition }) => definition);
}

function matchesTitleWords(definition: PaletteModeDefinition, query: string): boolean {
	const words = `${definition.title} ${definition.subtitle}`.toLocaleLowerCase().split(/\s+/);
	return query.split(/\s+/).every((term) => words.some((word) => word.startsWith(term)));
}

/**
 * `alias + Space` enters a mode directly, as the prefixes did. Longer aliases are
 * tried first so `esdir ` is not read as `e` followed by a query.
 */
export function parseDirectModeEntry(
	input: string,
	prefixes: Prefixes,
): { modeId: PaletteModeId; query: string } | undefined {
	const lower = input.toLocaleLowerCase();
	const candidates = [
		...PALETTE_MODES.map(({ id }) => ({ id, alias: paletteModeAlias(id, prefixes) })),
		// `es` stays a hidden alias of the vault Everything search.
		{ id: "everything" as const, alias: "es" },
	].sort((a, b) => b.alias.length - a.alias.length);
	for (const { id, alias } of candidates) {
		const prefix = `${alias.toLocaleLowerCase()} `;
		if (alias && lower.startsWith(prefix))
			return { modeId: id, query: input.slice(prefix.length).replace(/^\s+/, "") };
	}
	return undefined;
}
