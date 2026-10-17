import { type App } from "obsidian";
import type { CommandResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { type Command, sortCommandMatches } from "src/search/command/commandSorting";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";
import { getCommands } from "src/platform/obsidianInternals";

export class CommandProvider implements PaletteProvider<CommandResult> {
	constructor(
		private readonly app: App,
		private readonly recents: () => string[],
	) {}
	getCommands(): Command[] {
		return getCommands(this.app);
	}
	async search({ query }: PaletteSearchRequest): Promise<CommandResult[]> {
		const commands = this.getCommands();
		const recent = new Map(this.recents().map((id, index) => [id, index]));
		const matched = query
			? sortCommandMatches(
					searchFuzzyQuery(query, commands, [
						(command) => command.name,
						(command) => command.id,
					]).map((match) => ({
						command: match.obj,
						fuzzyScore: match.score,
					})),
					query,
				)
			: commands;
		const ordered = query
			? matched
			: matched.sort(
					(a, b) =>
						(recent.get(a.id) ?? Infinity) - (recent.get(b.id) ?? Infinity) ||
						a.name.localeCompare(b.name),
				);
		return ordered.map((command) => ({
			id: command.id,
			mode: "command",
			primary: command.name,
			secondary: command.id,
			icon: ICONS.command,
			commandId: command.id,
		}));
	}
}
