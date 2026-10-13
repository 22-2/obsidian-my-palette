import type { App, TFile } from "obsidian";
import type { PropertyKind, PropertyResult } from "src/palette/results";
import {
	formatPropertyValue,
	PROPERTY_KIND_ICONS,
	propertyKindOf,
} from "src/properties/propertyKind";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

/** Obsidian fixes these keys, so they are always listed, even when the note lacks them. */
const RESERVED_KEYS = ["aliases", "tags", "cssclasses"] as const;
/** Written by Obsidian for the note's own metadata, not an editable property. */
const HIDDEN_KEYS = new Set(["position"]);

interface VaultPropertyInfo {
	type?: unknown;
	widget?: unknown;
	count?: unknown;
}

// Unofficial APIs: the vault-wide keys and each key's assigned type. A missing
// function leaves the Vault section empty and the rest of the list working.
interface MetadataInternals {
	getAllPropertyInfos?: () => Record<string, VaultPropertyInfo>;
}

interface TypeManagerInternals {
	getAssignedWidget?: (key: string) => unknown;
}

function vaultInfos(app: App): Record<string, VaultPropertyInfo> {
	const infos = (app.metadataCache as unknown as MetadataInternals).getAllPropertyInfos?.();
	return infos && typeof infos === "object" ? infos : {};
}

function declaredType(
	app: App,
	key: string,
	info: VaultPropertyInfo | undefined,
): string | undefined {
	const assigned = (
		app as unknown as { metadataTypeManager?: TypeManagerInternals }
	).metadataTypeManager?.getAssignedWidget?.(key);
	if (typeof assigned === "string") return assigned;
	if (typeof info?.widget === "string") return info.widget;
	return typeof info?.type === "string" ? info.type : undefined;
}

function isReserved(key: string): boolean {
	return (RESERVED_KEYS as readonly string[]).includes(key);
}

function countOf(info: VaultPropertyInfo | undefined): number {
	return typeof info?.count === "number" ? info.count : 0;
}

function countLabel(count: number): string {
	return `${count} ${count === 1 ? "note" : "notes"}`;
}

interface PropertyRowInit {
	key: string;
	section: PropertyResult["section"];
	kind: PropertyKind;
	secondary: string;
	inNote: boolean;
	sourcePath: string;
}

function propertyRow({
	key,
	section,
	kind,
	secondary,
	inNote,
	sourcePath,
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
	};
}

/**
 * Lists the properties of the current note under This note and Reserved, then the
 * keys used elsewhere in the vault under Vault. Typed input filters each section
 * separately, so the section order stays fixed.
 */
export class PropertyProvider implements PaletteProvider<PropertyResult> {
	constructor(private readonly app: App) {}

	async search({ query, sourceFile }: PaletteSearchRequest): Promise<PropertyResult[]> {
		const file = sourceFile ?? this.app.workspace.getActiveFile();
		if (file?.extension !== "md") return [];
		const sections = this.sectionsOf(file);
		if (!query.trim()) return sections.flat();
		return sections.flatMap((section) =>
			searchFuzzyQuery(query, section, [(result) => result.primary]).map(({ obj }) => obj),
		);
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
					section: "This note",
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
				section: "Reserved",
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
		return Object.keys(infos)
			.filter((key) => !inNote.has(key) && !isReserved(key) && !HIDDEN_KEYS.has(key))
			.map((key) => ({ key, count: countOf(infos[key]) }))
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
					secondary: countLabel(count),
					inNote: false,
					sourcePath,
				});
			});
	}
}
