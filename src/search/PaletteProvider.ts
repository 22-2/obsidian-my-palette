import type { TFile } from "obsidian";
import type { EverythingScope, PaletteMode, PaletteResult } from "src/palette/results";

export interface PaletteSearchRequest {
	mode: PaletteMode;
	query: string;
	signal?: AbortSignal;
	everythingScope?: EverythingScope;
	includeIgnored?: boolean;
	/** Optional fixed origin used by persistent related-note searches. */
	sourceFile?: TFile;
	/** Several notes at once, for the modes that can list or edit them together (Properties). */
	sourceFiles?: readonly TFile[];
}

export interface PaletteProvider<TResult extends PaletteResult = PaletteResult> {
	search(request: PaletteSearchRequest): Promise<TResult[]>;
}
