import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

// A stand-in for the Everything HTTP server that records what the palette asks.
const requests: URL[] = [];
let serverStatus = 200;
const server = http.createServer((req, res) => {
	requests.push(new URL(req.url ?? "/", "http://localhost"));
	res.setHeader("Content-Type", "application/json");
	res.statusCode = serverStatus;
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
	serverStatus = 200;
	await obsidian.waitReady();
	await obsidian.evaluateApp(async () => {
		await (
			app as unknown as {
				plugins: {
					plugins: Record<string, { testEverythingConnection(): Promise<unknown> }>;
				};
			}
		).plugins.plugins["my-palette"].testEverythingConnection();
	});
	requests.length = 0;
});

test("failed integrations leave Home and Modes and successful setup restores Everything", async ({
	obsidian,
}) => {
	const testConnection = () =>
		obsidian.evaluateApp(async () =>
			(
				app as unknown as {
					plugins: {
						plugins: Record<
							string,
							{ testEverythingConnection(): Promise<{ ok: boolean }> }
						>;
					};
				}
			).plugins.plugins["my-palette"].testEverythingConnection(),
		);
	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Everything" })).toHaveCount(1);
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Related notes" })).toHaveCount(0);
	serverStatus = 503;
	expect((await testConnection()).ok).toBe(false);
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Everything" })).toHaveCount(0);
	await page.locator(MODAL_INPUT).press("Escape");
	const opened = page.context().waitForEvent("page");
	await obsidian.evaluateApp(() =>
		(
			app as unknown as { plugins: { plugins: Record<string, { openSettings(): void }> } }
		).plugins.plugins["my-palette"].openSettings(),
	);
	const settings = await opened;
	await settings
		.locator(".setting-item-name")
		.filter({ hasText: /^Modes$/ })
		.click();
	await expect(settings.getByText("Everything", { exact: true })).toBeHidden();
	await expect(settings.getByText("Related notes", { exact: true })).toBeHidden();
	await expect(settings.getByText("Notes", { exact: true })).toBeVisible();
	serverStatus = 200;
	expect((await testConnection()).ok).toBe(true);
	await expect(settings.getByText("Everything", { exact: true })).toBeVisible();
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

test("the Obsidian-excluded switch changes the single Everything mode's scope", async ({
	obsidian,
}) => {
	const page = await openPaletteWith(obsidian, "e report");
	await expect.poll(() => requests.length).toBeGreaterThan(0);
	expect(requests.at(-1)!.searchParams.get("search")).toContain("ext:");
	const before = requests.length;
	await page
		.locator(".my-palette-status-toggle")
		.filter({ hasText: "Obsidian-excluded" })
		.click();
	await expect.poll(() => requests.length).toBeGreaterThan(before);
	expect(requests.at(-1)!.searchParams.get("search")).not.toContain("ext:");
	await expect(page.locator(".my-palette-mode-chip")).toHaveText("e");
	const after = requests.length;
	await page
		.locator(".my-palette-status-toggle")
		.filter({ hasText: "Obsidian-excluded" })
		.click();
	await expect.poll(() => requests.length).toBeGreaterThan(after);
	expect(requests.at(-1)!.searchParams.get("search")).toContain("ext:");
});
