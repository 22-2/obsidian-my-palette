import type { MyPaletteSettings } from "src/core/settingsModel";
import type { EverythingResult } from "src/core/results";
import { EverythingEsClient } from "src/features/search/everything/EverythingEsClient";
import { EverythingHttpClient } from "src/features/search/everything/EverythingHttpClient";

/** 設定の backend に応じて、HTTP サーバーと es.exe のどちらで検索するかを切り替える。 */
export class EverythingClient {
	private readonly http = new EverythingHttpClient();
	private readonly es = new EverythingEsClient();

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
