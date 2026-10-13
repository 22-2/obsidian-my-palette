import type { IntegrationSettings, ModeSettingsMap, MyPaletteSettings } from "src/settings/model";
import type { PaletteMode } from "src/palette/results";
import type { IntegrationReadiness } from "src/app/integrationAvailability";

export type PaletteModeId =
	| "notes"
	| "commands"
	| "everything"
	| "outlinks"
	| "backlinks"
	| "bookmarks"
	| "smart"
	| "tabs"
	| "plugins";

export interface PaletteModeDefinition {
	id: PaletteModeId;
	mode: PaletteMode;
	title: string;
	subtitle: string;
	icon: string;
	placeholder: string;
}

/** Home lists the modes in this order when the input is empty. */
export const PALETTE_MODES: readonly PaletteModeDefinition[] = [
	{
		id: "notes",
		mode: "file",
		title: "Notes",
		subtitle: "Obsidian",
		icon: "files",
		placeholder: "Search notes",
	},
	{
		id: "commands",
		mode: "command",
		title: "Commands",
		subtitle: "Obsidian",
		icon: "square-terminal",
		placeholder: "Search commands",
	},
	{
		id: "everything",
		mode: "everything",
		title: "Everything",
		subtitle: "All files",
		icon: "search",
		placeholder: "Search vault files with Everything",
	},
	{
		id: "outlinks",
		mode: "link",
		title: "Outgoing links",
		subtitle: "Current note",
		icon: "links-going-out",
		placeholder: "Search links in the active note",
	},
	{
		id: "backlinks",
		mode: "backlink",
		title: "Backlinks",
		subtitle: "Current note",
		icon: "links-coming-in",
		placeholder: "Search backlinks to the active note",
	},
	{
		id: "bookmarks",
		mode: "bookmark",
		title: "Bookmarks",
		subtitle: "Obsidian",
		icon: "bookmark",
		placeholder: "Search bookmarks",
	},
	{
		id: "smart",
		mode: "smart",
		title: "Related notes",
		subtitle: "Smart Connections",
		icon: "sparkles",
		placeholder: "Search Smart Connections",
	},
	{
		id: "tabs",
		mode: "tab",
		title: "Tabs",
		subtitle: "Workspace",
		icon: "panel-top",
		placeholder: "Search open tabs",
	},
	{
		id: "plugins",
		mode: "plugin",
		title: "Plugins",
		subtitle: "Installed",
		icon: "puzzle",
		placeholder: "Search installed plugins",
	},
];

export function getPaletteMode(id: PaletteModeId): PaletteModeDefinition {
	const definition = PALETTE_MODES.find((mode) => mode.id === id);
	if (!definition) throw new Error(`Unknown palette mode: ${id}`);
	return definition;
}

export function findPaletteMode(mode: PaletteMode): PaletteModeDefinition | undefined {
	return PALETTE_MODES.find((definition) => definition.mode === mode);
}

/** The alias typed to enter a mode, as stored in the settings. */
export function paletteModeAlias(id: PaletteModeId, modes: ModeSettingsMap): string {
	return modes[id].alias;
}

/**
 * Checks an alias typed in the settings. Aliases are matched as `alias + Space`,
 * so aliases sharing a prefix can coexist; only an identical alias would be ambiguous.
 */
export function validateModeAlias(
	id: PaletteModeId,
	value: string,
	modes: ModeSettingsMap,
): string | undefined {
	const alias = value.trim().toLocaleLowerCase();
	if (!alias) return "Enter an alias.";
	if (/\s/.test(alias)) return "Aliases cannot contain spaces.";
	const taken = PALETTE_MODES.filter((mode) => mode.id !== id)
		.map((mode) => paletteModeAlias(mode.id, modes))
		.map((other) => other.toLocaleLowerCase());
	if (taken.includes(alias)) return `"${value.trim()}" is already used by another mode.`;
	return undefined;
}

/** The integration that provides a mode. Modes without one are built in. */
const INTEGRATION_OF_MODE: Partial<Record<PaletteModeId, keyof IntegrationSettings>> = {
	everything: "everything",
	smart: "smartConnections",
};

/** Whether the integration that provides a mode is switched on. */
export function isModeIntegrationOn(id: PaletteModeId, settings: MyPaletteSettings): boolean {
	const integration = INTEGRATION_OF_MODE[id];
	return integration ? settings.integrations[integration].enabled : true;
}

/**
 * The modes the palette may enter. A mode is off when its own switch or its integration
 * is off; Home and alias entry read this, while the settings keep each switch as set.
 */
export function isModeIntegrationReady(
	id: PaletteModeId,
	readiness: IntegrationReadiness,
): boolean {
	const integration = INTEGRATION_OF_MODE[id];
	return integration ? readiness[integration] : true;
}

export function availableModes(
	settings: MyPaletteSettings,
	readiness: IntegrationReadiness,
): ModeSettingsMap {
	return Object.fromEntries(
		PALETTE_MODES.map(({ id }) => [
			id,
			{
				...settings.modes[id],
				enabled:
					settings.modes[id].enabled &&
					isModeIntegrationOn(id, settings) &&
					isModeIntegrationReady(id, readiness),
			},
		]),
	) as ModeSettingsMap;
}

/**
 * Mode entries for Home: an exact alias first, then alias prefixes, then
 * titles whose words start with every typed term. An empty input lists all modes.
 */
export function matchPaletteModes(input: string, modes: ModeSettingsMap): PaletteModeDefinition[] {
	const query = input.trim().toLocaleLowerCase();
	const enabledModes = PALETTE_MODES.filter(({ id }) => modes[id].enabled);
	if (!query) return enabledModes;
	const rank = (definition: PaletteModeDefinition): number => {
		const alias = paletteModeAlias(definition.id, modes).toLocaleLowerCase();
		if (alias === query) return 0;
		if (alias.startsWith(query)) return 1;
		return matchesTitleWords(definition, query) ? 2 : -1;
	};
	return enabledModes
		.map((definition) => ({ definition, rank: rank(definition) }))
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
 * tried first so a longer alias is not read as a shorter one followed by a query.
 */
export function parseDirectModeEntry(
	input: string,
	modes: ModeSettingsMap,
): { modeId: PaletteModeId; query: string } | undefined {
	const lower = input.toLocaleLowerCase();
	const candidates = PALETTE_MODES.filter(({ id }) => modes[id].enabled)
		.map(({ id }) => ({ id, alias: paletteModeAlias(id, modes) }))
		.sort((a, b) => b.alias.length - a.alias.length);
	for (const { id, alias } of candidates) {
		const prefix = `${alias.toLocaleLowerCase()} `;
		if (alias && lower.startsWith(prefix))
			return { modeId: id, query: input.slice(prefix.length).replace(/^\s+/, "") };
	}
	return undefined;
}
