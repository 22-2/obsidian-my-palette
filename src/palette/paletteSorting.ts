import type { App } from "obsidian";
import type { PaletteResult } from "src/palette/results";
import { normalizeFrontmatterPrior } from "src/shared/frontmatter";

export const PALETTE_SORT_KEYS = [
	"name",
	"path",
	"modified",
	"created",
	"recent",
	"prior",
] as const;

export type PaletteSortKey = (typeof PALETTE_SORT_KEYS)[number];
export type PaletteSortMode = "file" | "link" | "backlink";

export interface PaletteSort {
	key: PaletteSortKey;
	desc: boolean;
}

type SortablePaletteResult = Extract<PaletteResult, { mode: "file" | "link" | "backlink" }>;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function isPaletteSortableMode(mode: string): mode is PaletteSortMode {
	return mode === "file" || mode === "link" || mode === "backlink";
}

export function defaultSortDirection(key: PaletteSortKey): boolean {
	return key === "modified" || key === "created" || key === "prior";
}

/** ファイル関連の結果だけを、他の行の位置を保ったまま並べ替える。 */
export function sortPaletteResults(
	app: App,
	results: readonly PaletteResult[],
	sorting: PaletteSort | undefined,
): PaletteResult[] {
	if (!sorting) return [...results];
	const indexes: number[] = [];
	const recent = new Map(
		(app.workspace.getLastOpenFiles?.() ?? []).map((filePath, index) => [filePath, index]),
	);
	const rows: Array<{
		result: SortablePaletteResult;
		index: number;
		value: string | number | undefined;
	}> = [];
	for (const [index, result] of results.entries()) {
		if (result.mode !== "file" && result.mode !== "link" && result.mode !== "backlink")
			continue;
		indexes.push(index);
		rows.push({ result, index, value: sortValue(app, result, sorting.key, recent) });
	}
	rows.sort((left, right) => {
		const { value: a } = left;
		const { value: b } = right;
		// 欠損値は昇順・降順のどちらでも末尾に置く。
		if (a === undefined || b === undefined) {
			if (a === b) return left.index - right.index;
			return a === undefined ? 1 : -1;
		}
		const comparison =
			typeof a === "number" && typeof b === "number"
				? a - b
				: collator.compare(String(a), String(b));
		return (sorting.desc ? -comparison : comparison) || left.index - right.index;
	});
	const sorted = [...results];
	indexes.forEach((index, position) => {
		sorted[index] = rows[position].result;
	});
	return sorted;
}

function sortValue(
	app: App,
	result: SortablePaletteResult,
	key: PaletteSortKey,
	recent: ReadonlyMap<string, number>,
): string | number | undefined {
	const file = result.file;
	switch (key) {
		case "name":
			return result.primary;
		case "path":
			return result.mode === "file" ? result.vaultPath : result.file.path;
		case "modified": {
			const modified =
				result.mode === "file" ? (result.mtime ?? file?.stat.mtime) : file?.stat.mtime;
			return typeof modified === "number" && Number.isFinite(modified) ? modified : undefined;
		}
		case "created":
			return finite(file?.stat.ctime);
		case "recent": {
			return recent.get(result.mode === "file" ? result.vaultPath : result.file.path);
		}
		case "prior": {
			const prior =
				result.mode === "file"
					? result.prior
					: file
						? normalizeFrontmatterPrior(
								app.metadataCache.getFileCache(file)?.frontmatter?.prior,
							)
						: undefined;
			return finite(prior);
		}
	}
}

function finite(value: number | undefined): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
