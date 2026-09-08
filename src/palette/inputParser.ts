import type { EverythingScope, ParsedInput, PaletteMode } from "src/palette/results";
import type { SearchHistoryCategory } from "src/settings/model";

export interface Prefixes {
	command: string;
	everything: string;
	includeIgnored: string;
}

/** Built-in related prefixes stay short; `b ` is reserved for backlinks. */
export const RELATED_PREFIXES = {
	link: "o ",
	backlink: "b ",
} as const;

export function validatePrefixes(prefixes: Prefixes): string | null {
	const values = [prefixes.command, prefixes.everything, prefixes.includeIgnored];
	// eslint-disable-next-line no-control-regex -- \0 check prevents NUL injection into child-process arguments
	if (values.some((value) => !value || /[\r\n\0]/.test(value)))
		return "Prefixes cannot be empty or contain a newline or NUL.";
	const normalized = values.map((value) => value.trimEnd().toLocaleLowerCase());
	for (let index = 0; index < normalized.length; index += 1) {
		for (let other = index + 1; other < normalized.length; other += 1) {
			if (
				normalized[index] === normalized[other] ||
				normalized[index].startsWith(normalized[other]) ||
				normalized[other].startsWith(normalized[index])
			)
				return "Prefixes must not overlap.";
		}
	}
	return null;
}

export function parseInput(raw: string, prefixes: Prefixes): ParsedInput {
	const ignoredPrefix = `${prefixes.includeIgnored.trimEnd()} `;
	const includeIgnored =
		Boolean(ignoredPrefix.trim()) &&
		raw.toLocaleLowerCase().startsWith(ignoredPrefix.toLocaleLowerCase());
	const modeInput = includeIgnored ? raw.slice(ignoredPrefix.length) : raw;
	const lower = modeInput.toLocaleLowerCase();
	if (lower === "esdir" || lower === "es") {
		// Why: these two built-in commands are useful as zero-query searches;
		// requiring a trailing space makes the documented `es`/`esdir` shortcuts
		// look like ordinary file queries until the user types another character.
		return {
			raw,
			mode: "everything",
			query: "",
			everythingScope: lower === "esdir" ? "directory" : "vault",
			includeIgnored,
		};
	}
	const candidates: Array<{
		prefix: string;
		mode: Exclude<PaletteMode, "file">;
		everythingScope?: EverythingScope;
		allowIgnored?: boolean;
	}> = [
		{ prefix: `${prefixes.command.trimEnd()} `, mode: "command" },
		{ prefix: RELATED_PREFIXES.link, mode: "link", allowIgnored: false },
		{ prefix: RELATED_PREFIXES.backlink, mode: "backlink", allowIgnored: false },
		{ prefix: "bk ", mode: "bookmark" },
		{ prefix: "sc ", mode: "smart" },
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
		if (
			candidate.prefix &&
			(!includeIgnored || candidate.allowIgnored !== false) &&
			lower.startsWith(candidate.prefix.toLocaleLowerCase())
		) {
			return {
				raw,
				mode: candidate.mode,
				query: modeInput.slice(candidate.prefix.length).replace(/^\s+/, ""),
				everythingScope: candidate.everythingScope,
				includeIgnored,
			};
		}
	}
	return { raw, mode: "file", query: modeInput, includeIgnored };
}

export function getSearchHistoryCategory(
	input: Pick<ParsedInput, "mode" | "everythingScope">,
): SearchHistoryCategory {
	if (input.mode === "everything" && input.everythingScope === "directory")
		return "everything-directory";
	return input.mode;
}
