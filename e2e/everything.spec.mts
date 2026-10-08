import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "obsidian-e2e-toolkit";
import { openPaletteWith, pluginVaultOptions } from "./support.mts";

// A stand-in for the Everything HTTP server that records what the palette asks.
const requests: URL[] = [];
const server = http.createServer((req, res) => {
	requests.push(new URL(req.url ?? "/", "http://localhost"));
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify({ results: [] }));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

// The plugin starts with its data.json already pointing at the stand-in server.
test.use({
	vaultOptions: pluginVaultOptions({
		everything: { httpUrl: `http://127.0.0.1:${port}/` },
	}),
});

test.beforeEach(async ({ obsidian }) => {
	requests.length = 0;
	await obsidian.waitReady();
});

test.afterAll(() => {
	server.close();
});

// Everything itself is Windows-only: the plugin accepts only drive-letter or UNC
// paths from the server, so result rows cannot be produced on Linux. What can be
// verified anywhere is the request the palette sends to the HTTP server.
test("the e prefix sends a vault-scoped query to the Everything HTTP server", async ({
	obsidian,
}) => {
	const vaultRoot = await obsidian.evaluateApp(() =>
		(app.vault.adapter as unknown as { getBasePath(): string }).getBasePath(),
	);
	const page = await openPaletteWith(obsidian, "e report");
	await expect.poll(() => requests.length).toBeGreaterThan(0);

	const params = requests.at(-1)!.searchParams;
	expect(params.get("json")).toBe("1");
	expect(params.get("search")).toContain(`path:"${vaultRoot}"`);
	expect(params.get("search")).toContain("ext:");
	expect(params.get("search")).toMatch(/report$/);
	await expect(page.locator(".my-palette-suggest-modal")).toContainText("No suggestions");
});

test("the esdir prefix drops the extension filter for folder-wide searches", async ({
	obsidian,
}) => {
	await openPaletteWith(obsidian, "esdir report");
	await expect.poll(() => requests.length).toBeGreaterThan(0);
	expect(requests.at(-1)!.searchParams.get("search")).not.toContain("ext:");
});
