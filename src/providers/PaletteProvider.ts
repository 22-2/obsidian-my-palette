import type { PaletteResult } from "../model/results";

export interface PaletteProvider {
	search(query: string, signal?: AbortSignal): Promise<PaletteResult[]>;
}
