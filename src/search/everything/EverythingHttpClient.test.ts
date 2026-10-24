import { afterEach, describe, expect, it, vi } from "vitest";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";

const settings = {
	backend: "http" as const,
	esPath: "es.exe",
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

describe("すべてHTTPクライアント", () => {
	it("制限された JSON リクエストを構築し、ファイルとフォルダーを解析します", async () => {
		const requestUrl = vi.fn().mockResolvedValue({
			status: 200,
			arrayBuffer: new ArrayBuffer(4),
			text: JSON.stringify({
				results: [
					{ name: "note.md", path: "C:\\Vault", type: "file" },
					{ name: "C:\\Vault\\folder", type: "folder" },
					{ name: "bad-relative" },
					{ name: 42, path: "C:\\Vault" },
				],
			}),
		});
		vi.stubGlobal("window", { requestUrl, setTimeout, clearTimeout });
		const client = new EverythingHttpClient();
		const results = await client.search(
			"a b",
			{ ...settings, username: "u", password: "p" },
			undefined,
			900,
		);
		const request = requestUrl.mock.calls[0]?.[0];
		expect(new URL(request.url).searchParams.get("count")).toBe("500");
		expect(request.headers.Authorization).toBe(`Basic ${btoa("u:p")}`);
		expect(results.map(({ absolutePath, kind }) => [absolutePath, kind])).toEqual([
			["C:\\Vault\\note.md", "file"],
			["C:\\Vault\\folder", "folder"],
		]);
	});

	it("無効な設定、失敗した応答、サイズが大きすぎるボディや形式が不正なボディを拒否します。", async () => {
		const client = new EverythingHttpClient();
		await expect(client.search("x", { ...settings, httpUrl: "bad url" })).rejects.toThrow(
			"有効な",
		);
		await expect(client.search("x", { ...settings, httpUrl: "file:///tmp" })).rejects.toThrow(
			"http か",
		);
		for (const [status, text, size, message] of [
			[401, "", 0, "認証に失敗しました"],
			[503, "", 0, "503 を返しました"],
			[200, "", 2 * 1024 * 1024 + 1, "2 MiB を超えました"],
			[200, "{", 1, "不正な JSON"],
			[200, "{}", 2, "未対応の JSON 形式"],
		] as const) {
			vi.stubGlobal("window", {
				requestUrl: vi
					.fn()
					.mockResolvedValue({ status, text, arrayBuffer: new ArrayBuffer(size) }),
				setTimeout,
				clearTimeout,
			});
			await expect(client.search("x", settings)).rejects.toThrow(message);
		}
	});

	it("中止を伝播し、すべてのアクティブなリクエストをキャンセルします", async () => {
		const resolvers = new Map<string, (value: EverythingResponse) => void>();
		const requestUrl = vi.fn(
			({ url }: { url: string }) =>
				new Promise<EverythingResponse>((resolve) => {
					resolvers.set(new URL(url).searchParams.get("search")!, resolve);
				}),
		);
		vi.stubGlobal("window", { requestUrl, setTimeout, clearTimeout });
		const client = new EverythingHttpClient();
		const controller = new AbortController();
		const pending = client.search("x", settings, controller.signal);
		controller.abort();
		resolvers.get("x")?.(responseFor("x.md"));
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		const second = client.search("y", settings);
		client.cancel();
		resolvers.get("y")?.(responseFor("late.md"));
		await expect(second).rejects.toMatchObject({ name: "AbortError" });
	});

	it("別々のパレットビューからの同時リクエストを独立させます", async () => {
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
