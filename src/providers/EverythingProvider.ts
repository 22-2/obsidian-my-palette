import type { MyPaletteSettings } from "../model/settings";
import type { EverythingResult } from "../model/results";
import { EsClient } from "../everything/EsClient";
import type { PaletteProvider } from "./PaletteProvider";

export class EverythingProvider implements PaletteProvider {
	constructor(
		private readonly client: EsClient,
		private readonly settings: () => MyPaletteSettings["everything"],
	) {}
	async search(query: string, signal?: AbortSignal): Promise<EverythingResult[]> {
		if (!query) return [];
		return await this.client.search(query, this.settings(), signal);
	}
}
