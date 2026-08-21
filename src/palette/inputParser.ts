import type { EverythingScope, ParsedInput, PaletteMode } from "src/model/results";
import type { SearchHistoryCategory } from "src/model/settings";

export interface Prefixes {
	command: string;
	everything: string;
	includeIgnored: string;
}

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
	const candidates: Array<{
		prefix: string;
		mode: Exclude<PaletteMode, "file">;
		everythingScope?: EverythingScope;
	}> = [
		{ prefix: `${prefixes.command.trimEnd()} `, mode: "command" },
		{ prefix: "b ", mode: "bookmark" },
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
		if (candidate.prefix && lower.startsWith(candidate.prefix.toLocaleLowerCase())) {
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
