import type { EverythingScope, ParsedInput, PaletteMode } from "src/palette/results";
import type { ModeSettingsMap, SearchHistoryCategory } from "src/settings/model";
import { paletteModeAlias } from "src/palette/modes";

/**
 * Reads a prefixed input the way the palette did before Home. Palettes now
 * enter modes through `src/palette/modes`; this remains for history rows stored
 * without a category.
 */
export function parseInput(raw: string, modes: ModeSettingsMap): ParsedInput {
	const lower = raw.toLocaleLowerCase();
	const directoryAlias = paletteModeAlias("everything-all", modes);
	if (lower === directoryAlias.toLocaleLowerCase()) {
		// Why: the folder-wide alias is useful as a zero-query search; requiring a
		// trailing space would make it look like an ordinary file query until the user types more.
		return {
			raw,
			mode: "everything",
			query: "",
			everythingScope: "directory",
		};
	}
	const candidates: Array<{
		prefix: string;
		mode: Exclude<PaletteMode, "file">;
		everythingScope?: EverythingScope;
	}> = [
		{ prefix: `${paletteModeAlias("commands", modes)} `, mode: "command" },
		{ prefix: `${paletteModeAlias("outlinks", modes)} `, mode: "link" },
		{ prefix: `${paletteModeAlias("backlinks", modes)} `, mode: "backlink" },
		{ prefix: `${paletteModeAlias("bookmarks", modes)} `, mode: "bookmark" },
		{ prefix: `${paletteModeAlias("smart", modes)} `, mode: "smart" },
		{ prefix: `${paletteModeAlias("tabs", modes)} `, mode: "tab" },
		{
			prefix: `${paletteModeAlias("everything-all", modes)} `,
			mode: "everything",
			everythingScope: "directory",
		},
		{
			prefix: `${paletteModeAlias("everything", modes)} `,
			mode: "everything",
			everythingScope: "vault",
		},
	];
	candidates.sort((a, b) => b.prefix.length - a.prefix.length);
	for (const candidate of candidates) {
		if (candidate.prefix && lower.startsWith(candidate.prefix.toLocaleLowerCase())) {
			return {
				raw,
				mode: candidate.mode,
				query: raw.slice(candidate.prefix.length).replace(/^\s+/, ""),
				everythingScope: candidate.everythingScope,
			};
		}
	}
	return { raw, mode: "file", query: raw };
}

export function getSearchHistoryCategory(
	input: Pick<ParsedInput, "mode" | "everythingScope">,
): SearchHistoryCategory {
	if (input.mode === "everything" && input.everythingScope === "directory")
		return "everything-directory";
	return input.mode;
}
