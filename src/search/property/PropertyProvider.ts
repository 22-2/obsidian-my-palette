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
}

// Unofficial APIs: the vault-wide keys and each key's assigned type. A missing
// function leaves the Vault section empty and the rest of the list working.
interface TypeManagerInternals {
	getAllProperties?: () => Record<string, VaultPropertyInfo>;
	getPropertyOccurrences?: () => Record<string, number>;
	getAssignedWidget?: (key: string) => unknown;
}

function vaultInfos(app: App): Record<string, VaultPropertyInfo> {
	const infos = (
		app as unknown as { metadataTypeManager?: TypeManagerInternals }
	).metadataTypeManager?.getAllProperties?.();
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
	/** Set when the list spans several notes. */
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
		primary: `Add property "${key}"`,
		secondary: "Choose a type",
		icon: "plus",
		key,
		kind: "new",
		section: "New",
		inNote: false,
		sourcePath,
		...(sourcePaths ? { sourcePaths } : {}),
	};
}

/**
 * Lists the properties of the current note under This note and Reserved, then the
 * keys used elsewhere in the vault under Vault. Typed input filters each section
 * separately, so the section order stays fixed.
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
		// Nothing matches, so the typed text can only be a key the note does not have yet.
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
	 * Keys of several notes at once: those any of them has come first, most shared first,
	 * then the reserved keys and the rest of the vault. Each row edits all the notes.
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
		const sharedLabel = (key: string) => `${holders(key).length}/${files.length} notes`;
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
					section: "These notes",
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
				section: "Reserved",
				kind: kindOf(key),
				secondary: holders(key).length > 0 ? sharedLabel(key) : "Not set",
				inNote: holders(key).length > 0,
				sourcePath,
				sourcePaths,
			}),
		);
		const counts =
			(
				this.app as unknown as { metadataTypeManager?: TypeManagerInternals }
			).metadataTypeManager?.getPropertyOccurrences?.() ?? {};
		const vault = Object.keys(infos)
			.filter((key) => !shared.has(key) && !isReserved(key) && !HIDDEN_KEYS.has(key))
			.map((key) => ({ key, count: counts[key.toLowerCase()] ?? 0 }))
			.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
			.map(({ key, count }) =>
				propertyRow({
					key,
					section: "Vault",
					kind: kindOf(key),
					secondary: countLabel(count),
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
		// Obsidian returns usage counts separately, keyed by lowercase property name.
		const counts =
			(
				this.app as unknown as { metadataTypeManager?: TypeManagerInternals }
			).metadataTypeManager?.getPropertyOccurrences?.() ?? {};
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
					secondary: countLabel(count),
					inNote: false,
					sourcePath,
				});
			});
	}
}
