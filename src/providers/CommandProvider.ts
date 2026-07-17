import { prepareFuzzySearch, type App } from "obsidian";
import type { CommandResult } from "../model/results";
import type { PaletteProvider } from "./PaletteProvider";

interface Command {
	id: string;
	name: string;
}

export class CommandProvider implements PaletteProvider {
	constructor(
		private readonly app: App,
		private readonly recents: () => string[],
	) {}
	getCommands(): Command[] {
		return Object.values(
			(this.app.commands as unknown as { commands: Record<string, Command> }).commands ?? {},
		);
	}
	async search(query: string): Promise<CommandResult[]> {
		const commands = this.getCommands();
		const recent = new Map(this.recents().map((id, index) => [id, index]));
		const fuzzy = query ? prepareFuzzySearch(query) : null;
		return commands
			.map((command) => ({ command, match: fuzzy?.(command.name) ?? null }))
			.filter(({ match }) => !query || match !== null)
			.sort((a, b) => {
				if (query)
					return (
						(b.match?.score ?? -Infinity) - (a.match?.score ?? -Infinity) ||
						(recent.get(a.command.id) ?? Infinity) -
							(recent.get(b.command.id) ?? Infinity) ||
						a.command.name.localeCompare(b.command.name)
					);
				return (
					(recent.get(a.command.id) ?? Infinity) -
						(recent.get(b.command.id) ?? Infinity) ||
					a.command.name.localeCompare(b.command.name)
				);
			})
			.map(({ command }) => ({
				id: command.id,
				mode: "command",
				primary: command.name,
				secondary: command.id,
				icon: "terminal",
				commandId: command.id,
			}));
	}
}
