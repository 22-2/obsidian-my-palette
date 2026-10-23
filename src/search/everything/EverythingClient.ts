import type { MyPaletteSettings } from "src/settings/model";
import type { EverythingResult } from "src/palette/results";
import { EverythingEsClient } from "src/search/everything/EverythingEsClient";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";

/** 設定の backend に応じて、HTTP サーバーと es.exe のどちらで検索するかを切り替える。 */
export class EverythingClient {
	private readonly http: EverythingHttpClient;
	private readonly es: EverythingEsClient;

	constructor(debug?: (message: string, detail?: unknown) => void) {
		this.http = new EverythingHttpClient(debug);
		this.es = new EverythingEsClient(debug);
	}

	cancel(): void {
		this.http.cancel();
		this.es.cancel();
	}

	search(
		query: string,
		settings: MyPaletteSettings["everything"],
		signal?: AbortSignal,
		limit?: number,
	): Promise<EverythingResult[]> {
		const client = settings.backend === "es" ? this.es : this.http;
		return client.search(query, settings, signal, limit);
	}
}
