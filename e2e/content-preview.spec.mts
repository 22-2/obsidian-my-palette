import { expect, test } from "./fixtures.mts";
import {
	closePalette,
	MODAL_INPUT,
	PLUGIN_ID,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("content previews appear after search results without blocking them", async ({
	obsidian,
}, testInfo) => {
	await obsidian.createNote("Preview.md", "前の文章\nここに約束があります\n後の文章");
	await obsidian.evaluatePlugin(
		PLUGIN_ID,
		(plugin: {
			integrationAvailability: object;
			providers: { everything: { search: () => Promise<unknown[]> } };
			app: {
				vault: {
					adapter: { getBasePath(): string };
					cachedRead: (file: unknown) => Promise<string>;
				};
			};
		}) => {
			Object.defineProperty(plugin.integrationAvailability, "current", {
				get: () => ({ everything: true, smartConnections: false }),
			});
			const root = plugin.app.vault.adapter.getBasePath();
			plugin.providers.everything.search = async () => [
				{
					id: "preview",
					mode: "everything",
					primary: "Preview.md",
					secondary: root,
					absolutePath: `${root}\\Preview.md`,
					vaultPath: "Preview.md",
					scope: "vault",
					kind: "file",
					icon: "file",
					attributes: "",
				},
			];
			const original = plugin.app.vault.cachedRead.bind(plugin.app.vault);
			plugin.app.vault.cachedRead = async (file) => {
				await new Promise<void>((resolve) => {
					(
						globalThis as typeof globalThis & { releasePreview?: () => void }
					).releasePreview = resolve;
				});
				return original(file);
			};
		},
	);
	await runPaletteCommand(obsidian, "open-everything-list");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).fill("content:約束");
	const row = page.locator(".suggestion-item").filter({ hasText: "Preview.md" });
	await expect(row).toBeVisible();
	await expect(row.locator(".my-palette-suggestion__content-preview")).toHaveCount(0);
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					typeof (globalThis as typeof globalThis & { releasePreview?: () => void })
						.releasePreview,
			),
		)
		.toBe("function");
	await obsidian.evaluateApp(() =>
		(globalThis as typeof globalThis & { releasePreview?: () => void }).releasePreview?.(),
	);
	await expect(row.locator(".my-palette-suggestion__content-preview")).toContainText(
		"ここに約束があります",
	);
	await expect(
		row.locator(".my-palette-suggestion__content-preview .my-palette-suggestion__match"),
	).toHaveText("約束");
	await page
		.locator(".my-palette-suggest-modal")
		.screenshot({ path: testInfo.outputPath("content-preview.png") });
	await closePalette(page);
	await runPaletteCommand(obsidian, "open-everything-list");
	await expect(row.locator(".my-palette-suggestion__content-preview")).toContainText(
		"ここに約束があります",
	);
	await closePalette(page);
	await obsidian.evaluateApp(async () => {
		(globalThis as typeof globalThis & { releasePreview?: () => void }).releasePreview =
			undefined;
		const file = app.vault.getFileByPath("Preview.md");
		if (file) await app.vault.modify(file, "更新された約束の文章です");
	});
	await runPaletteCommand(obsidian, "open-everything-list");
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					typeof (globalThis as typeof globalThis & { releasePreview?: () => void })
						.releasePreview,
			),
		)
		.toBe("function");
	await obsidian.evaluateApp(() =>
		(globalThis as typeof globalThis & { releasePreview?: () => void }).releasePreview?.(),
	);
	await expect(row.locator(".my-palette-suggestion__content-preview")).toContainText(
		"更新された約束の文章です",
	);
});

test("visible previews limit concurrent reads and discard old searches", async ({ obsidian }) => {
	await obsidian.createNote("Preview.md", "ここに約束があります");
	await obsidian.evaluatePlugin(
		PLUGIN_ID,
		(plugin: {
			integrationAvailability: object;
			providers: { everything: { search: () => Promise<unknown[]> } };
			app: {
				vault: {
					adapter: { getBasePath(): string };
					cachedRead: (file: unknown) => Promise<string>;
				};
			};
		}) => {
			Object.defineProperty(plugin.integrationAvailability, "current", {
				get: () => ({ everything: true, smartConnections: false }),
			});
			const root = plugin.app.vault.adapter.getBasePath();
			plugin.providers.everything.search = async () =>
				Array.from({ length: 60 }, (_, index) => ({
					id: `preview-${index}`,
					mode: "everything",
					primary: `Preview ${index}.md`,
					secondary: root,
					absolutePath: `${root}\\Preview.md`,
					vaultPath: "Preview.md",
					scope: "vault",
					kind: "file",
					icon: "file",
					attributes: "",
				}));
			const original = plugin.app.vault.cachedRead.bind(plugin.app.vault);
			const state = globalThis as typeof globalThis & {
				previewStarts: number;
				releasePreviews: (() => void)[];
			};
			state.previewStarts = 0;
			state.releasePreviews = [];
			plugin.app.vault.cachedRead = async (file) => {
				state.previewStarts++;
				await new Promise<void>((resolve) => state.releasePreviews.push(resolve));
				return original(file);
			};
		},
	);
	await runPaletteCommand(obsidian, "open-everything-list");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.fill("content:約束");
	await expect(page.locator(".suggestion-item")).toHaveCount(50);
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() => (globalThis as typeof globalThis & { previewStarts: number }).previewStarts,
			),
		)
		.toBe(3);
	await input.fill("content:別の語");
	await obsidian.evaluateApp(() => {
		for (const release of (
			globalThis as typeof globalThis & { releasePreviews: (() => void)[] }
		).releasePreviews)
			release();
	});
	await expect(page.locator(".my-palette-suggestion__content-preview")).toHaveCount(0);
});

for (const command of ["open-sidebar-palette", "open-table-palette"]) {
	test(`content previews appear in ${command}`, async ({ obsidian }) => {
		await obsidian.createNote("Preview.md", "ここに約束があります");
		await obsidian.evaluatePlugin(
			PLUGIN_ID,
			(plugin: {
				integrationAvailability: object;
				providers: { everything: { search: () => Promise<unknown[]> } };
				app: { vault: { adapter: { getBasePath(): string } } };
			}) => {
				Object.defineProperty(plugin.integrationAvailability, "current", {
					get: () => ({ everything: true, smartConnections: false }),
				});
				const root = plugin.app.vault.adapter.getBasePath();
				plugin.providers.everything.search = async () => [
					{
						id: "preview",
						mode: "everything",
						primary: "Preview.md",
						secondary: root,
						absolutePath: `${root}\\Preview.md`,
						vaultPath: "Preview.md",
						scope: "vault",
						kind: "file",
						icon: "file",
						attributes: "",
					},
				];
			},
		);
		await runPaletteCommand(obsidian, command);
		const view = obsidian.page.locator(".my-palette-view").last();
		await view.locator(".prompt-input").fill("e content:約束");
		await expect(view.locator(".my-palette-suggestion__content-preview")).toContainText(
			"ここに約束があります",
		);
	});
}

test("opening a content search result highlights the matches in the editor", async ({
	obsidian,
}) => {
	await obsidian.createNote("Preview.md", "first 約束\nsecond 約束");
	await obsidian.open("Preview.md");
	await obsidian.evaluateApp(() => {
		const view = app.workspace.activeEditor as unknown as {
			editMode: { highlightSearchMatches: (ranges: unknown) => void };
		};
		const original = view.editMode.highlightSearchMatches;
		view.editMode.highlightSearchMatches = (ranges) => {
			(window as unknown as { contentHighlights?: unknown }).contentHighlights = ranges;
			original.call(view.editMode, ranges);
		};
	});
	await obsidian.evaluatePlugin(
		PLUGIN_ID,
		(plugin: {
			integrationAvailability: object;
			providers: { everything: { search: () => Promise<unknown[]> } };
			app: { vault: { adapter: { getBasePath(): string } } };
		}) => {
			Object.defineProperty(plugin.integrationAvailability, "current", {
				get: () => ({ everything: true, smartConnections: false }),
			});
			const root = plugin.app.vault.adapter.getBasePath();
			plugin.providers.everything.search = async () => [
				{
					id: "preview",
					mode: "everything",
					primary: "Preview.md",
					secondary: root,
					absolutePath: `${root}\\Preview.md`,
					vaultPath: "Preview.md",
					scope: "vault",
					kind: "file",
					icon: "file",
					attributes: "",
				},
			];
		},
	);
	await runPaletteCommand(obsidian, "open-everything-list");
	const input = obsidian.page.locator(MODAL_INPUT);
	await input.fill("content:約束");
	await expect(
		obsidian.page.locator(".suggestion-item").filter({ hasText: "Preview.md" }),
	).toBeVisible();
	await input.press("Enter");
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() => (window as unknown as { contentHighlights?: unknown }).contentHighlights,
			),
		)
		.toEqual([
			{ from: { line: 0, ch: 6 }, to: { line: 0, ch: 8 } },
			{ from: { line: 1, ch: 7 }, to: { line: 1, ch: 9 } },
		]);
});
