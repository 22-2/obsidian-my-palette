import type { EverythingScope, PaletteMode, PaletteResult } from "../model/results";

export interface PaletteSearchRequest {
	mode: PaletteMode;
	query: string;
	signal?: AbortSignal;
	everythingScope?: EverythingScope;
}

export interface PaletteProvider<TResult extends PaletteResult = PaletteResult> {
	search(request: PaletteSearchRequest): Promise<TResult[]>;
}
