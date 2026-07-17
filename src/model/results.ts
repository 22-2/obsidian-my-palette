import type { TFile } from "obsidian";

export type PaletteMode = "file" | "command" | "everything";

export interface ParsedInput {
	raw: string;
	mode: PaletteMode;
	query: string;
}

export interface BaseResult {
	id: string;
	mode: PaletteMode;
	primary: string;
	secondary: string;
	icon: string;
}

export interface FileResult extends BaseResult {
	mode: "file";
	vaultPath: string;
	file?: TFile;
}

export interface CommandResult extends BaseResult {
	mode: "command";
	commandId: string;
}

export interface EverythingResult extends BaseResult {
	mode: "everything";
	absolutePath: string;
	kind: "file" | "folder";
	attributes: string;
}

export type PaletteResult = FileResult | CommandResult | EverythingResult;
