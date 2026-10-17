import type { App, TFile } from "obsidian";
import type { PropertyKind, PropertyResult } from "src/palette/results";
import {
	formatPropertyValue,
	PROPERTY_KIND_ICONS,
	propertyKindOf,
} from "src/properties/propertyKind";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";
import { getMetadataTypeManager, type VaultPropertyInfo } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

/** Obsidian が固定するキー。ノートが持っていなくても、常に一覧に出す。 */
const RESERVED_KEYS = ["aliases", "tags", "cssclasses"] as const;
/** Obsidian がノート自身のメタデータとして書くもので、編集できるプロパティではない。 */
const HIDDEN_KEYS = new Set(["position"]);

function vaultInfos(app: App): Record<string, VaultPropertyInfo> {
	const infos = getMetadataTypeManager(app)?.getAllProperties?.();
	return infos && typeof infos === "object" ? infos : {};
}

function declaredType(
	app: App,
	key: string,
	info: VaultPropertyInfo | undefined,
): string | undefined {
	const assigned = getMetadataTypeManager(app)?.getAssignedWidget?.(key);
	if (typeof assigned === "string") return assigned;
	if (typeof info?.widget === "string") return info.widget;
	return typeof info?.type === "string" ? info.type : undefined;
}

function isReserved(key: string): boolean {
	return (RESERVED_KEYS as readonly string[]).includes(key);
}

function noteCountLabel(count: number): string {
	return t("property.noteCount", { count });
}

interface PropertyRowInit {
	key: string;
	section: PropertyResult["section"];
	kind: PropertyKind;
	secondary: string;
	inNote: boolean;
	sourcePath: string;
	/** 一覧が複数のノートにまたがるときに設定する。 */
	sourcePaths?: readonly string[];
}

function propertyRow({
	key,
	section,
	kind,
	secondary,
	inNote,
	sourcePath,
	sourcePaths,
}: PropertyRowInit): PropertyResult {
	return {
		id: `property:${key}`,
		mode: "property",
		primary: key,
		secondary,
		icon: PROPERTY_KIND_ICONS[kind],
		key,
		kind,
		section,
		inNote,
		sourcePath,
		...(sourcePaths ? { sourcePaths } : {}),
	};
}

function newKeyRow(
	key: string,
	sourcePath: string,
	sourcePaths?: readonly string[],
): PropertyResult {
	return {
		id: `property:new:${key}`,
		mode: "property",
		primary: t("property.addKey", { key }),
		secondary: t("property.chooseType"),
		icon: ICONS.add,
		key,
		kind: "new",
		section: "新規",
		inNote: false,
		sourcePath,
		...(sourcePaths ? { sourcePaths } : {}),
	};
}

/**
 * 現在のノートのプロパティを「このノート」と「予約済み」の下に並べ、ほかで使われているキーを
 * 「Vault」の下に並べる。入力された文字列は各セクションごとに絞り込むので、セクションの順は固定のまま。
 */
export class PropertyProvider implements PaletteProvider<PropertyResult> {
	constructor(private readonly app: App) {}

	async search({
		query,
		sourceFile,
		sourceFiles,
	}: PaletteSearchRequest): Promise<PropertyResult[]> {
		const files = (
			sourceFiles && sourceFiles.length > 0
				? sourceFiles
				: [sourceFile ?? this.app.workspace.getActiveFile()]
		).filter((candidate): candidate is TFile => candidate?.extension === "md");
		if (files.length === 0) return [];
		const file = files[0];
		const many = files.length > 1;
		const sections = many ? this.sectionsOfMany(files) : this.sectionsOf(file);
		if (!query.trim()) return sections.flat();
		const matched = sections.flatMap((section) =>
			searchFuzzyQuery(query, section, [(result) => result.primary]).map(({ obj }) => obj),
		);
		// 一致するものがないので、入力された文字列はノートがまだ持たないキーでしかありえない。
		if (matched.length === 0)
			return [
				newKeyRow(
					query.trim(),
					file.path,
					many ? files.map(({ path }) => path) : undefined,
				),
			];
		return matched;
	}

	/**
	 * 複数のノートのキーを一度に扱う。どれかのノートが持つものを先に、共有の多いものを先頭にし、
	 * その後に予約済みのキーと、Vault のそれ以外を並べる。各行はすべてのノートを編集する。
	 */
	private sectionsOfMany(files: readonly TFile[]): PropertyResult[][] {
		const frontmatters = files.map(
			(file): Record<string, unknown> =>
				this.app.metadataCache.getFileCache(file)?.frontmatter ?? {},
		);
		const sourcePaths = files.map(({ path }) => path);
		const sourcePath = sourcePaths[0];
		const infos = vaultInfos(this.app);
		const holders = (key: string) => frontmatters.filter((frontmatter) => key in frontmatter);
		const sharedLabel = (key: string) =>
			t("property.sharedNotes", { shared: holders(key).length, total: files.length });
		const kindOf = (key: string) =>
			propertyKindOf(key, holders(key)[0]?.[key], declaredType(this.app, key, infos[key]));

		const shared = new Map<string, number>();
		for (const frontmatter of frontmatters)
			for (const key of Object.keys(frontmatter))
				if (!HIDDEN_KEYS.has(key) && !isReserved(key))
					shared.set(key, (shared.get(key) ?? 0) + 1);
		const theseNotes = [...shared]
			.sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
			.map(([key]) =>
				propertyRow({
					key,
					section: "これらのノート",
					kind: kindOf(key),
					secondary: sharedLabel(key),
					inNote: true,
					sourcePath,
					sourcePaths,
				}),
			);
		const reserved = RESERVED_KEYS.map((key) =>
			propertyRow({
				key,
				section: "予約済み",
				kind: kindOf(key),
				secondary: holders(key).length > 0 ? sharedLabel(key) : t("property.notSet"),
				inNote: holders(key).length > 0,
				sourcePath,
				sourcePaths,
			}),
		);
		const counts = getMetadataTypeManager(this.app)?.getPropertyOccurrences?.() ?? {};
		const vault = Object.keys(infos)
			.filter((key) => !shared.has(key) && !isReserved(key) && !HIDDEN_KEYS.has(key))
			.map((key) => ({ key, count: counts[key.toLowerCase()] ?? 0 }))
			.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
			.map(({ key, count }) =>
				propertyRow({
					key,
					section: "Vault",
					kind: kindOf(key),
					secondary: noteCountLabel(count),
					inNote: false,
					sourcePath,
					sourcePaths,
				}),
			);
		return [theseNotes, reserved, vault];
	}

	private sectionsOf(file: TFile): PropertyResult[][] {
		const frontmatter: Record<string, unknown> =
			this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const noteKeys = Object.keys(frontmatter).filter((key) => !HIDDEN_KEYS.has(key));
		const infos = vaultInfos(this.app);
		return [
			this.thisNoteRows(file.path, frontmatter, noteKeys, infos),
			this.reservedRows(file.path, frontmatter, infos),
			this.vaultRows(file.path, noteKeys, infos),
		];
	}

	private thisNoteRows(
		sourcePath: string,
		frontmatter: Record<string, unknown>,
		noteKeys: string[],
		infos: Record<string, VaultPropertyInfo>,
	): PropertyResult[] {
		return noteKeys
			.filter((key) => !isReserved(key))
			.map((key) => {
				const value = frontmatter[key];
				const kind = propertyKindOf(key, value, declaredType(this.app, key, infos[key]));
				return propertyRow({
					key,
					section: "このノート",
					kind,
					secondary: formatPropertyValue(kind, value),
					inNote: true,
					sourcePath,
				});
			});
	}

	private reservedRows(
		sourcePath: string,
		frontmatter: Record<string, unknown>,
		infos: Record<string, VaultPropertyInfo>,
	): PropertyResult[] {
		return RESERVED_KEYS.map((key) => {
			const value = frontmatter[key];
			const kind = propertyKindOf(key, value, declaredType(this.app, key, infos[key]));
			return propertyRow({
				key,
				section: "予約済み",
				kind,
				secondary: formatPropertyValue(kind, value),
				inNote: key in frontmatter,
				sourcePath,
			});
		});
	}

	private vaultRows(
		sourcePath: string,
		noteKeys: string[],
		infos: Record<string, VaultPropertyInfo>,
	): PropertyResult[] {
		const inNote = new Set(noteKeys);
		// Obsidian は使用数を別に返す。キーは小文字のプロパティ名になっている。
		const counts = getMetadataTypeManager(this.app)?.getPropertyOccurrences?.() ?? {};
		return Object.keys(infos)
			.filter((key) => !inNote.has(key) && !isReserved(key) && !HIDDEN_KEYS.has(key))
			.map((key) => ({ key, count: counts[key.toLowerCase()] ?? 0 }))
			.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
			.map(({ key, count }) => {
				const kind = propertyKindOf(
					key,
					undefined,
					declaredType(this.app, key, infos[key]),
				);
				return propertyRow({
					key,
					section: "Vault",
					kind,
					secondary: noteCountLabel(count),
					inNote: false,
					sourcePath,
				});
			});
	}
}
