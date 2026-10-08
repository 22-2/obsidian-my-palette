import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "obsidian-e2e-toolkit";
import { openPaletteWith, PLUGIN_ID, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

// Everything itself is Windows-only: the plugin accepts only drive-letter or UNC
// paths from the server, so result rows cannot be produced on Linux. What can be
// verified anywhere is the request the palette sends to the HTTP server.
test("the e prefix sends a vault-scoped query to the Everything HTTP server", async ({
	obsidian,
}) => {
	const requests: URL[] = [];
	const server = http.createServer((req, res) => {
		requests.push(new URL(req.url ?? "/", "http://localhost"));
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ results: [] }));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address() as AddressInfo;
		await obsidian.waitReady();
		const vaultRoot = await obsidian.page.evaluate(
			({ id, url }) => {
				const app = (window as any).app;
				app.plugins.plugins[id].settings.everything.httpUrl = url;
				return app.vault.adapter.getBasePath() as string;
			},
			{ id: PLUGIN_ID, url: `http://127.0.0.1:${port}/` },
		);
		const page = await openPaletteWith(obsidian, "e report");
		await expect.poll(() => requests.length).toBeGreaterThan(0);

		const params = requests.at(-1)!.searchParams;
		expect(params.get("json")).toBe("1");
		expect(params.get("search")).toContain(`path:"${vaultRoot}"`);
		expect(params.get("search")).toContain("ext:");
		expect(params.get("search")).toMatch(/report$/);
		await expect(page.locator(".my-palette-suggest-modal")).toContainText("No suggestions");
	} finally {
		server.close();
	}
});

test("the esdir prefix drops the extension filter for folder-wide searches", async ({
	obsidian,
}) => {
	const requests: URL[] = [];
	const server = http.createServer((req, res) => {
		requests.push(new URL(req.url ?? "/", "http://localhost"));
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ results: [] }));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address() as AddressInfo;
		await obsidian.waitReady();
		await obsidian.page.evaluate(
			({ id, url }) => {
				(window as any).app.plugins.plugins[id].settings.everything.httpUrl = url;
			},
			{ id: PLUGIN_ID, url: `http://127.0.0.1:${port}/` },
		);
		await openPaletteWith(obsidian, "esdir report");
		await expect.poll(() => requests.length).toBeGreaterThan(0);
		expect(requests.at(-1)!.searchParams.get("search")).not.toContain("ext:");
	} finally {
		server.close();
	}
});
