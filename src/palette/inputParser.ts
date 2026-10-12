import type { EverythingScope, ParsedInput, PaletteMode } from "src/palette/results";
import type { SearchHistoryCategory } from "src/settings/model";

export interface Prefixes {
	command: string;
	everything: string;
}

/** Built-in related prefixes stay short; `b ` is reserved for backlinks. */
export const RELATED_PREFIXES = {
	link: "o ",
	backlink: "b ",
} as const;

/**
 * Reads a prefixed input the way the palette did before Root Search. Palettes now
 * enter modes through `src/palette/modes`; this remains for history rows stored
 * without a category.
 */
export function parseInput(raw: string, prefixes: Prefixes): ParsedInput {
	const lower = raw.toLocaleLowerCase();
	if (lower === "esdir" || lower === "es") {
		// Why: these two built-in commands are useful as zero-query searches;
		// requiring a trailing space makes the documented `es`/`esdir` shortcuts
		// look like ordinary file queries until the user types another character.
		return {
			raw,
			mode: "everything",
			query: "",
			everythingScope: lower === "esdir" ? "directory" : "vault",
		};
	}
	const candidates: Array<{
		prefix: string;
		mode: Exclude<PaletteMode, "file">;
		everythingScope?: EverythingScope;
	}> = [
		{ prefix: `${prefixes.command.trimEnd()} `, mode: "command" },
		{ prefix: RELATED_PREFIXES.link, mode: "link" },
		{ prefix: RELATED_PREFIXES.backlink, mode: "backlink" },
		{ prefix: "bk ", mode: "bookmark" },
		{ prefix: "sc ", mode: "smart" },
		{ prefix: "t ", mode: "tab" },
		{ prefix: "esdir ", mode: "everything", everythingScope: "directory" },
		{
			prefix: `${prefixes.everything.trimEnd()} `,
			mode: "everything",
			everythingScope: "vault",
		},
		{ prefix: "es ", mode: "everything", everythingScope: "vault" },
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
