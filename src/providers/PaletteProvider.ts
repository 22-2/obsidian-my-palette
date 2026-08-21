import type { EverythingScope, PaletteMode, PaletteResult } from "src/model/results";

export interface PaletteSearchRequest {
	mode: PaletteMode;
	query: string;
	signal?: AbortSignal;
	everythingScope?: EverythingScope;
	includeIgnored?: boolean;
}

export interface PaletteProvider<TResult extends PaletteResult = PaletteResult> {
	search(request: PaletteSearchRequest): Promise<TResult[]>;
}
