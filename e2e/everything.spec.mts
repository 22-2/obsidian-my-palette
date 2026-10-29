import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./fixtures.mts";
import {
	flipOption,
	IGNORED_OPTION,
	MODAL_INPUT,
	MODAL_ROW,
	openHomeWith,
	PLUGIN_ID,
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
		everything: { backend: "http", httpUrl: `http://127.0.0.1:${port}/` },
	}),
});

type EverythingHost = { testEverythingConnection(): Promise<{ ok: boolean }> };

test.beforeEach(async ({ obsidian }) => {
	serverStatus = 200;
	await obsidian.evaluatePlugin<{ ok: boolean }, EverythingHost>(PLUGIN_ID, (plugin) =>
		plugin.testEverythingConnection(),
	);
	requests.length = 0;
});

test("Everything remains visible but unavailable after a failed connection and recovers", async ({
	obsidian,
}) => {
	const testConnection = () =>
		obsidian.evaluatePlugin<{ ok: boolean }, EverythingHost>(PLUGIN_ID, (plugin) =>
			plugin.testEverythingConnection(),
		);
	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).fill("Everything");
	const everything = page.locator(MODAL_ROW).filter({ hasText: "Everything" });
	await expect(everything).toHaveCount(1);
	await expect(everything).not.toContainText("利用できません");
	serverStatus = 503;
	expect((await testConnection()).ok).toBe(false);
	await expect(everything).toContainText("利用できません");
	await page.locator(MODAL_INPUT).press("Escape");
	// The plugin's own settings entry is what this test checks, so it is invoked directly.
	await obsidian.evaluatePlugin<void, { openSettings(): void }>(PLUGIN_ID, (plugin) =>
		plugin.openSettings(),
	);
	// Only the window lookup uses findPage, so an already open settings window is found too.
	const settings = await obsidian.findPage(
		(candidate) => candidate.locator(".setting-item-name").filter({ hasText: /^モード$/ }),
		{ description: "my-palette settings window" },
	);
	await settings
		.locator(".setting-item-name")
		.filter({ hasText: /^モード$/ })
		.click();
	await expect(settings.getByText("Everything", { exact: true })).toBeHidden();
	await expect(settings.getByText("関連ノート", { exact: true })).toBeHidden();
	await expect(settings.getByText("ノート", { exact: true })).toBeVisible();
	serverStatus = 200;
	expect((await testConnection()).ok).toBe(true);
	await expect(settings.getByText("Everything", { exact: true })).toBeVisible();
	await obsidian.closeSettings();
	await runPaletteCommand(obsidian, "open-home");
	await page.locator(MODAL_INPUT).fill("Everything");
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Everything" })).not.toContainText(
		"利用できません",
	);
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
	const vaultRoot = await obsidian.vaultPath();
	const page = await openHomeWith(obsidian, "e report");
	await expect.poll(() => requests.length).toBeGreaterThan(0);

	const params = requests.at(-1)!.searchParams;
	expect(params.get("json")).toBe("1");
	expect(params.get("search")).toContain(`path:"${vaultRoot}"`);
	expect(params.get("search")).toContain("ext:");
	expect(params.get("search")).toMatch(/report$/);
	await expect(page.locator(".my-palette-suggest-modal")).toContainText("候補がありません");
});

test("the Obsidian-excluded option changes the single Everything mode's scope", async ({
	obsidian,
}) => {
	const page = await openHomeWith(obsidian, "e report");
	await expect.poll(() => requests.length).toBeGreaterThan(0);
	expect(requests.at(-1)!.searchParams.get("search")).toContain("ext:");
	const before = requests.length;
	await flipOption(page, IGNORED_OPTION);
	await expect.poll(() => requests.length).toBeGreaterThan(before);
	expect(requests.at(-1)!.searchParams.get("search")).not.toContain("ext:");
	await expect(page.locator(".my-palette-mode-chip")).toHaveText("e");
	const after = requests.length;
	await flipOption(page, IGNORED_OPTION);
	await expect.poll(() => requests.length).toBeGreaterThan(after);
	expect(requests.at(-1)!.searchParams.get("search")).toContain("ext:");
});
