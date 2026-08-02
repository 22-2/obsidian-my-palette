import { type App } from "obsidian";
import fuzzysort from "fuzzysort";
import type { CommandResult } from "src/model/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/providers/PaletteProvider";
import { type Command, sortCommandMatches } from "src/providers/commandSorting";

export class CommandProvider implements PaletteProvider<CommandResult> {
	constructor(
		private readonly app: App,
		private readonly recents: () => string[],
	) {}
	getCommands(): Command[] {
		return Object.values(
			(this.app.commands as unknown as { commands: Record<string, Command> }).commands ?? {},
		);
	}
	async search({ query }: PaletteSearchRequest): Promise<CommandResult[]> {
		const commands = this.getCommands();
		const recent = new Map(this.recents().map((id, index) => [id, index]));
		const matched = query
			? sortCommandMatches(
					fuzzysort
						.go(query, commands, { key: (command) => command.name })
						.map((match) => ({
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
			icon: "terminal",
			commandId: command.id,
		}));
	}
}
