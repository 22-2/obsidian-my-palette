export interface Command {
	id: string;
	name: string;
}

interface RankedCommand {
	command: Command;
	fuzzyScore: number;
	rank: number;
	pluginName: string;
	actionName: string;
}

const leadingDecoration = /^[^\p{L}\p{N}]+/u;

function normalized(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function commandParts(name: string): { pluginName: string; actionName: string } {
	const separator = name.indexOf(":");
	const pluginName = (separator < 0 ? name : name.slice(0, separator))
		.replace(leadingDecoration, "")
		.trim();
	const actionName = (separator < 0 ? name : name.slice(separator + 1)).trim();
	return { pluginName, actionName };
}

function everyTermStartsAWord(value: string, terms: string[]): boolean {
	const words = normalized(value).split(/[^\p{L}\p{N}]+/u);
	return terms.every((term) => words.some((word) => word.startsWith(term)));
}

function matchRank(pluginName: string, actionName: string, query: string): number {
	const needle = normalized(query);
	const terms = needle.split(/\s+/).filter(Boolean);
	const plugin = normalized(pluginName);
	const action = normalized(actionName);
	const full = `${plugin}: ${action}`;
	if (plugin === needle) return 0;
	if (plugin.startsWith(needle)) return 1;
	if (action.startsWith(needle)) return 2;
	if (action.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle))) return 3;
	if (terms.length > 1 && everyTermStartsAWord(full, terms)) return 4;
	if (full.includes(needle)) return 5;
	return 6;
}

export function sortCommandMatches(
	matches: Array<{ command: Command; fuzzyScore: number }>,
	query: string,
): Command[] {
	const ranked: RankedCommand[] = matches.map(({ command, fuzzyScore }) => {
		const { pluginName, actionName } = commandParts(command.name);
		return {
			command,
			fuzzyScore,
			rank: matchRank(pluginName, actionName, query),
			pluginName,
			actionName,
		};
	});
	return ranked
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				(a.rank === 6 ? b.fuzzyScore - a.fuzzyScore : 0) ||
				a.actionName.localeCompare(b.actionName, undefined, { sensitivity: "base" }) ||
				a.pluginName.localeCompare(b.pluginName, undefined, { sensitivity: "base" }) ||
				a.command.id.localeCompare(b.command.id),
		)
		.map(({ command }) => command);
}
