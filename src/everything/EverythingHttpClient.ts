import type { ClientRequest, IncomingMessage } from "http";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import * as path from "path";
import type { MyPaletteSettings } from "../model/settings";
import type { EverythingResult } from "../model/results";

interface EverythingHttpItem {
	type?: unknown;
	name?: unknown;
	path?: unknown;
	attributes?: unknown;
}

interface EverythingHttpResponse {
	results?: unknown;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class EverythingHttpClient {
	private active: ClientRequest | null = null;

	constructor(private readonly debug?: (message: string, detail?: unknown) => void) {}

	cancel(): void {
		this.active?.destroy(new DOMException("Aborted", "AbortError"));
		this.active = null;
	}

	async search(
		query: string,
		settings: MyPaletteSettings["everything"],
		signal?: AbortSignal,
		limit = settings.maxResults,
	): Promise<EverythingResult[]> {
		const endpoint = this.buildUrl(query, settings, limit);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		this.cancel();
		this.debug?.("Requesting Everything HTTP Server", endpoint.toString());

		return await new Promise<EverythingResult[]>((resolve, reject) => {
			let settled = false;
			let timedOut = false;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener("abort", onAbort);
				callback();
			};
			const transport = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
			const headers: Record<string, string> = { Accept: "application/json" };
			if (settings.username)
				headers.Authorization = `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString("base64")}`;

			const request = transport(endpoint, { method: "GET", headers }, (response) => {
				void this.readResponse(response)
					.then((body) => {
						if (response.statusCode === 401)
							throw new Error("Everything HTTP authentication failed.");
						if (
							!response.statusCode ||
							response.statusCode < 200 ||
							response.statusCode >= 300
						)
							throw new Error(
								`Everything HTTP Server returned ${response.statusCode ?? "no status"}.`,
							);
						finish(() => resolve(this.parseResponse(body)));
					})
					.catch((error: unknown) => finish(() => reject(error)));
			});

			this.active = request;
			request.setTimeout(settings.requestTimeoutMs, () => {
				timedOut = true;
				request.destroy(new Error("Everything HTTP search timed out."));
			});
			request.on("close", () => {
				if (this.active === request) this.active = null;
			});
			request.on("error", (error: NodeJS.ErrnoException) => {
				if (signal?.aborted || error.name === "AbortError") {
					finish(() => reject(new DOMException("Aborted", "AbortError")));
					return;
				}
				if (timedOut) {
					finish(() => reject(new Error("Everything HTTP search timed out.")));
					return;
				}
				const message =
					error.code === "ECONNREFUSED"
						? "Everything HTTP Server is not running or the port is incorrect."
						: `Everything HTTP request failed: ${error.message}`;
				finish(() => reject(new Error(message)));
			});

			const onAbort = (): void => {
				request.destroy(new DOMException("Aborted", "AbortError"));
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			request.end();
		});
	}

	private buildUrl(query: string, settings: MyPaletteSettings["everything"], limit: number): URL {
		let endpoint: URL;
		try {
			endpoint = new URL(settings.httpUrl);
		} catch {
			throw new Error("Set a valid Everything HTTP Server URL.");
		}
		if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
			throw new Error("Everything HTTP Server URL must use http or https.");
		endpoint.search = "";
		endpoint.searchParams.set("search", query);
		endpoint.searchParams.set("json", "1");
		endpoint.searchParams.set("count", String(Math.min(500, Math.max(1, limit))));
		endpoint.searchParams.set("path_column", "1");
		endpoint.searchParams.set("attributes_column", "1");
		return endpoint;
	}

	private async readResponse(response: IncomingMessage): Promise<string> {
		const chunks: Buffer[] = [];
		let total = 0;
		for await (const chunk of response) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			total += buffer.length;
			if (total > MAX_RESPONSE_BYTES)
				throw new Error("Everything HTTP response exceeded 2 MiB.");
			chunks.push(buffer);
		}
		return Buffer.concat(chunks).toString("utf8");
	}

	private parseResponse(body: string): EverythingResult[] {
		let parsed: EverythingHttpResponse;
		try {
			parsed = JSON.parse(body) as EverythingHttpResponse;
		} catch {
			throw new Error("Everything HTTP Server returned invalid JSON.");
		}
		if (!Array.isArray(parsed.results))
			throw new Error("Everything HTTP Server returned an unsupported JSON format.");
		return parsed.results.flatMap((raw): EverythingResult[] => {
			const item = raw as EverythingHttpItem;
			if (typeof item.name !== "string") return [];
			const parent = typeof item.path === "string" ? item.path : "";
			const absolutePath = path.win32.isAbsolute(item.name)
				? item.name
				: path.win32.join(parent, item.name);
			if (!path.win32.isAbsolute(absolutePath)) return [];
			const attributes = typeof item.attributes === "string" ? item.attributes : "";
			const kind =
				String(item.type).toLocaleLowerCase() === "folder" ||
				attributes.toUpperCase().includes("D")
					? "folder"
					: "file";
			return [
				{
					id: absolutePath.toLocaleLowerCase(),
					mode: "everything",
					primary: path.win32.basename(absolutePath),
					secondary: path.win32.dirname(absolutePath),
					icon: kind,
					absolutePath,
					attributes,
					kind,
				},
			];
		});
	}
}
