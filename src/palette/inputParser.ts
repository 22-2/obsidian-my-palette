import type { EverythingScope, ParsedInput, PaletteMode } from "src/model/results";

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
	const lower = raw.toLocaleLowerCase();
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
				query: raw.slice(candidate.prefix.length).replace(/^\s+/, ""),
				everythingScope: candidate.everythingScope,
			};
		}
	}
	return { raw, mode: "file", query: raw };
}
