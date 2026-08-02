import type { MyPaletteSettings } from "src/model/settings";
import type { EverythingResult } from "src/model/results";

interface EverythingHttpItem {
	type?: unknown;
	name?: unknown;
	path?: unknown;
	attributes?: unknown;
}

interface EverythingHttpResponse {
	results?: unknown;
}

declare global {
	interface Window {
		requestUrl: (request: {
			url: string;
			method?: string;
			headers?: Record<string, string>;
			throw?: boolean;
		}) => Promise<{ status: number; arrayBuffer: ArrayBuffer; text: string }>;
	}
}

export class EverythingHttpClient {
	private active: AbortController | null = null;

	constructor(private readonly debug?: (message: string, detail?: unknown) => void) {}

	cancel(): void {
		this.active?.abort();
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

		const controller = new AbortController();
		this.active = controller;
		signal?.addEventListener("abort", () => controller.abort(), { once: true });
		const headers: Record<string, string> = { Accept: "application/json" };
		if (settings.username)
			headers.Authorization = `Basic ${btoa(`${settings.username}:${settings.password}`)}`;
		const timeout = new Promise<never>((_, reject) =>
			window.setTimeout(
				() => reject(new Error("Everything HTTP search timed out.")),
				settings.requestTimeoutMs,
			),
		);
		try {
			const response = await Promise.race([
				window.requestUrl({
					url: endpoint.toString(),
					method: "GET",
					headers,
					throw: false,
				}),
				timeout,
			]);
			if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
			if (response.status === 401) throw new Error("Everything HTTP authentication failed.");
			if (response.status < 200 || response.status >= 300)
				throw new Error(`Everything HTTP Server returned ${response.status}.`);
			if (response.arrayBuffer.byteLength > 2 * 1024 * 1024)
				throw new Error("Everything HTTP response exceeded 2 MiB.");
			return this.parseResponse(response.text);
		} catch (error) {
			if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
			throw error;
		} finally {
			if (this.active === controller) this.active = null;
		}
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
			const absolutePath = isAbsolutePath(item.name)
				? item.name
				: joinPath(parent, item.name);
			if (!isAbsolutePath(absolutePath)) return [];
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
					primary: basename(absolutePath),
					secondary: dirname(absolutePath),
					icon: kind,
					absolutePath,
					scope: "directory",
					attributes,
					kind,
				},
			];
		});
	}
}

function isAbsolutePath(value: string): boolean {
	return /^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\");
}

function joinPath(parent: string, name: string): string {
	return parent ? `${parent.replace(/[\\/]+$/, "")}\\${name}` : name;
}

function basename(value: string): string {
	return value.slice(Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/")) + 1);
}

function dirname(value: string): string {
	const index = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
	return index < 0 ? "" : value.slice(0, index);
}
