import type { ParsedInput, PaletteMode } from "../model/results";

export interface Prefixes {
	command: string;
	everything: string;
}

export function validatePrefixes(prefixes: Prefixes): string | null {
	const values = [prefixes.command, prefixes.everything];
	// eslint-disable-next-line no-control-regex -- \0 check prevents NUL injection into child-process arguments
	if (values.some((value) => !value || /[\r\n\0]/.test(value)))
		return "Prefixes cannot be empty or contain a newline or NUL.";
	const [command, everything] = values.map((value) => value.toLocaleLowerCase());
	if (
		command === everything ||
		command.startsWith(everything) ||
		everything.startsWith(command)
	) {
		return "Command and Everything prefixes must not overlap.";
	}
	return null;
}

export function parseInput(raw: string, prefixes: Prefixes): ParsedInput {
	const candidates: Array<{ prefix: string; mode: Exclude<PaletteMode, "file"> }> = [
		{ prefix: prefixes.command, mode: "command" },
		{ prefix: prefixes.everything, mode: "everything" },
	];
	candidates.sort((a, b) => b.prefix.length - a.prefix.length);
	const lower = raw.toLocaleLowerCase();
	for (const candidate of candidates) {
		if (candidate.prefix && lower.startsWith(candidate.prefix.toLocaleLowerCase())) {
			return {
				raw,
				mode: candidate.mode,
				query: raw.slice(candidate.prefix.length).replace(/^\s+/, ""),
			};
		}
	}
	return { raw, mode: "file", query: raw };
}
