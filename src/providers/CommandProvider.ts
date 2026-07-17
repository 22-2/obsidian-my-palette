import { type App } from "obsidian";
import fuzzysort from "fuzzysort";
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
		const matched = query
			? fuzzysort
					.go(query, commands, { key: (command) => command.name })
					.map(({ obj }) => obj)
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
