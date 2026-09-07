import { afterEach, describe, expect, it, vi } from "vitest";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";

const settings = {
	httpUrl: "http://127.0.0.1:51361/",
	username: "",
	password: "",
	maxResults: 100,
	debounceMs: 150,
	requestTimeoutMs: 10_000,
	vaultExtensions: ["md"],
};

type EverythingResponse = { status: number; arrayBuffer: ArrayBuffer; text: string };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("EverythingHttpClient", () => {
	it("keeps concurrent requests from separate palette views independent", async () => {
		const pending = new Map<string, (response: EverythingResponse) => void>();
		const requestUrl = vi.fn(({ url }: { url: string }) => {
			const query = new URL(url).searchParams.get("search") ?? "";
			return new Promise<EverythingResponse>((resolve) => {
				pending.set(query, (response) => resolve(response));
			});
		});
		vi.stubGlobal("window", {
			requestUrl,
			setTimeout: globalThis.setTimeout.bind(globalThis),
			clearTimeout: globalThis.clearTimeout.bind(globalThis),
		});

		const client = new EverythingHttpClient();
		const first = client.search("first", settings);
		const second = client.search("second", settings);
		await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(2));

		pending.get("first")?.(responseFor("first.md"));
		pending.get("second")?.(responseFor("second.md"));

		expect((await first)[0]?.absolutePath).toBe("C:\\Vault\\first.md");
		expect((await second)[0]?.absolutePath).toBe("C:\\Vault\\second.md");
	});
});

function responseFor(name: string): { status: number; arrayBuffer: ArrayBuffer; text: string } {
	const text = JSON.stringify({ results: [{ name, path: "C:\\Vault" }] });
	return { status: 200, arrayBuffer: new TextEncoder().encode(text).buffer, text };
}
