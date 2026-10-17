import type { IntegrationSettings, ModeSettingsMap, MyPaletteSettings } from "src/settings/model";
import type { PaletteMode } from "src/palette/results";
import type { IntegrationReadiness } from "src/app/integrationAvailability";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

export type PaletteModeId =
	| "notes"
	| "commands"
	| "everything"
	| "outlinks"
	| "backlinks"
	| "bookmarks"
	| "smart"
	| "tabs"
	| "plugins"
	| "snippets"
	| "properties"
	| "audit";

export interface PaletteModeDefinition {
	id: PaletteModeId;
	mode: PaletteMode;
	title: string;
	subtitle: string;
	icon: string;
	placeholder: string;
}

/** Home で入力が空のとき、モードはこの順に並ぶ。 */
export const PALETTE_MODES: readonly PaletteModeDefinition[] = [
	{
		id: "notes",
		mode: "file",
		title: t("mode.notes.title"),
		subtitle: t("mode.subtitle.obsidian"),
		icon: ICONS.files,
		placeholder: t("mode.notes.placeholder"),
	},
	{
		id: "commands",
		mode: "command",
		title: t("mode.commands.title"),
		subtitle: t("mode.subtitle.obsidian"),
		icon: ICONS.command,
		placeholder: t("mode.commands.placeholder"),
	},
	{
		id: "everything",
		mode: "everything",
		title: "Everything",
		subtitle: t("mode.everything.subtitle"),
		icon: ICONS.search,
		placeholder: t("mode.everything.placeholder"),
	},
	{
		id: "outlinks",
		mode: "link",
		title: t("mode.outlinks.title"),
		subtitle: t("mode.subtitle.currentNote"),
		icon: ICONS.outgoingLinks,
		placeholder: t("mode.outlinks.placeholder"),
	},
	{
		id: "backlinks",
		mode: "backlink",
		title: t("mode.backlinks.title"),
		subtitle: t("mode.subtitle.currentNote"),
		icon: ICONS.backlinks,
		placeholder: t("mode.backlinks.placeholder"),
	},
	{
		id: "bookmarks",
		mode: "bookmark",
		title: t("mode.bookmarks.title"),
		subtitle: t("mode.subtitle.obsidian"),
		icon: ICONS.bookmark,
		placeholder: t("mode.bookmarks.placeholder"),
	},
	{
		id: "smart",
		mode: "smart",
		title: t("mode.smart.title"),
		subtitle: t("settings.smart.name"),
		icon: ICONS.smartConnections,
		placeholder: t("mode.smart.placeholder"),
	},
	{
		id: "tabs",
		mode: "tab",
		title: t("mode.tabs.title"),
		subtitle: t("mode.tabs.subtitle"),
		icon: ICONS.tab,
		placeholder: t("mode.tabs.placeholder"),
	},
	{
		id: "plugins",
		mode: "plugin",
		title: t("mode.plugins.title"),
		subtitle: t("mode.plugins.subtitle"),
		icon: ICONS.plugin,
		placeholder: t("mode.plugins.placeholder"),
	},
	{
		id: "snippets",
		mode: "snippet",
		title: t("mode.snippets.title"),
		subtitle: t("mode.subtitle.css"),
		icon: ICONS.snippet,
		placeholder: t("mode.snippets.placeholder"),
	},
	{
		id: "properties",
		mode: "property",
		title: t("mode.properties.title"),
		subtitle: t("mode.subtitle.currentNote"),
		icon: ICONS.selection,
		placeholder: t("mode.properties.placeholder"),
	},
	{
		id: "audit",
		mode: "audit",
		title: t("mode.audit.title"),
		subtitle: t("mode.subtitle.vault"),
		icon: ICONS.vaultAudit,
		// 表示中の種類に置き換わる(auditKindChoice.ts を参照)。モード自身の定義として残す。
		placeholder: t("mode.audit.placeholder"),
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

/** 設定に保存された、モードに入るために打つエイリアス。 */
export function paletteModeAlias(id: PaletteModeId, modes: ModeSettingsMap): string {
	return modes[id].alias;
}

/**
 * 設定で打たれたエイリアスを確認する。エイリアスは「エイリアス + Space」で照合するので、
 * 前方が同じエイリアスは共存できる。まったく同じエイリアスだけが曖昧になる。
 */
export function validateModeAlias(
	id: PaletteModeId,
	value: string,
	modes: ModeSettingsMap,
): string | undefined {
	const alias = value.trim().toLocaleLowerCase();
	if (!alias) return t("mode.alias.empty");
	if (/\s/.test(alias)) return t("mode.alias.noSpace");
	const taken = PALETTE_MODES.filter((mode) => mode.id !== id)
		.map((mode) => paletteModeAlias(mode.id, modes))
		.map((other) => other.toLocaleLowerCase());
	if (taken.includes(alias)) return t("mode.alias.taken", { alias: value.trim() });
	return undefined;
}

/** モードを提供する連携。連携のないモードは組み込み。 */
const INTEGRATION_OF_MODE: Partial<Record<PaletteModeId, keyof IntegrationSettings>> = {
	everything: "everything",
	smart: "smartConnections",
};

/** モードを提供する連携のスイッチが入っているかどうか。 */
export function isModeIntegrationOn(id: PaletteModeId, settings: MyPaletteSettings): boolean {
	const integration = INTEGRATION_OF_MODE[id];
	return integration ? settings.integrations[integration].enabled : true;
}

/**
 * パレットに入ってよいモード。モード自身のスイッチか連携のスイッチが切れていれば無効になる。
 * Home とエイリアスによる入力はこれを読み、設定画面は各スイッチの状態をそのまま保つ。
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
 * Home のモードの一覧: エイリアスが完全一致するものを先に、次にエイリアスの前方一致、
 * 最後に、入力したすべての語で始まる単語を持つタイトル。入力が空ならすべてのモードを並べる。
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
 * 「エイリアス + Space」で、プレフィックスと同じようにモードへ直接入る。長いエイリアスを先に試し、
 * 長いエイリアスが短いエイリアスと後続のクエリとして読まれないようにする。
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
