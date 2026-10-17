import { expect, test, type ObsidianAPI } from "./fixtures.mts";
import type { Page } from "@playwright/test";
import {
	MODAL_INPUT,
	PLUGIN_ID,
	openHomeWith,
	optionMenuTitles,
	pluginVaultOptions,
	rowLabels,
	runPaletteCommand,
	waitForResolvedLinks,
	writeRaw,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

/** Calls the CLI handler the plugin registered, as `obsidian my-palette:audit` would. */
async function runAuditCli(obsidian: ObsidianAPI, params: Record<string, string>) {
	const output = await obsidian.evaluateApp(
		({ command, params }) => {
			const cli = (
				app as unknown as {
					cli: { handlers: Map<string, { handler(params: unknown): Promise<string> }> };
				}
			).cli;
			return cli.handlers.get(command)!.handler(params);
		},
		{ command: `${PLUGIN_ID}:audit`, params },
	);
	return JSON.parse(output) as { count: number; items: unknown[]; error?: string };
}

test.beforeEach(async ({ obsidian }) => {
	await writeRaw(obsidian, "notes/source.md", "[[linked]]\n\nSee [[Missing note]].\n");
	await writeRaw(obsidian, "notes/linked.md", "Linked from source.\n");
	await writeRaw(obsidian, "notes/orphan.md", "Nobody links here.\n");
	await writeRaw(obsidian, "notes/frontmatter-only.md", "---\ntags: [draft]\n---\n");
	await writeRaw(obsidian, "notes/canvas-target.md", "Placed on a canvas.\n");
	await writeRaw(
		obsidian,
		"board.canvas",
		JSON.stringify({
			nodes: [
				{
					id: "1",
					type: "file",
					file: "notes/canvas-target.md",
					x: 0,
					y: 0,
					width: 400,
					height: 400,
				},
			],
			edges: [],
		}),
	);
	await obsidian.evaluateApp(async () => {
		await app.vault.createFolder("empty/inner");
	});
	await waitForResolvedLinks(obsidian, { "notes/source.md": ["notes/linked.md"] });
});

test("lists orphaned files", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "orphaned-files", glob: "notes/**" });
	expect(report.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ path: "notes/orphan.md" }),
			expect.objectContaining({ path: "notes/source.md" }),
		]),
	);
	expect(report.items).not.toContainEqual(expect.objectContaining({ path: "notes/linked.md" }));
});

test("counts a file placed on a canvas as linked", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "orphaned-files" });
	expect(report.items).not.toContainEqual(
		expect.objectContaining({ path: "notes/canvas-target.md" }),
	);
});

test("lists broken links with the linking note and its one-based line", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "broken-links" });
	expect(report.items).toEqual([
		{ link: "Missing note", sources: [{ path: "notes/source.md", line: 3 }] },
	]);
});

test("lists empty files, including notes with only frontmatter", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "empty-files" });
	expect(report.items).toEqual([expect.objectContaining({ path: "notes/frontmatter-only.md" })]);
});

test("lists only the topmost empty folder", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "empty-folders" });
	expect(report.items).toEqual([{ path: "empty", foldersInside: 1 }]);
});

test("returns an error for an unknown kind", async ({ obsidian }) => {
	const report = await runAuditCli(obsidian, { kind: "orphans" });
	expect(report.error).toContain("orphaned-files");
});

/** Picks a kind in the options menu; choosing closes the menu because the list changes. */
async function chooseKind(page: Page, label: string): Promise<void> {
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	await page.locator(".menu .menu-item").filter({ hasText: label }).first().click();
	await page.locator(".menu").waitFor({ state: "detached" });
}

test("lists the chosen kind in the palette and switches it from the options menu", async ({
	obsidian,
}) => {
	const page = await openHomeWith(obsidian, "a ");
	await expect(page.locator(MODAL_INPUT)).toHaveAttribute("placeholder", "Search orphaned files");
	await expect.poll(() => rowLabels(page)).toContain("orphan.md");

	await chooseKind(page, "Broken links");
	await expect(page.locator(MODAL_INPUT)).toHaveAttribute("placeholder", "Search broken links");
	await expect.poll(() => rowLabels(page)).toEqual(["Missing note"]);
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					(
						app.plugins.plugins["my-palette"] as unknown as {
							settings: { audit: { kind: string } };
						}
					).settings.audit.kind,
			),
		)
		.toBe("broken-links");
});

test("offers the kinds only in Vault audit", async ({ obsidian }) => {
	const page = await openHomeWith(obsidian, "");
	expect(await optionMenuTitles(page)).not.toContain("Broken links");
});

test("opens the note with a broken link at the link's line", async ({ obsidian }) => {
	const page = await openHomeWith(obsidian, "a ");
	await chooseKind(page, "Broken links");
	await expect.poll(() => rowLabels(page)).toEqual(["Missing note"]);
	await page.locator(MODAL_INPUT).press("Enter");
	await expect
		.poll(() =>
			obsidian.evaluateApp(() => {
				const editor = app.workspace.activeEditor?.editor;
				return [app.workspace.getActiveFile()?.path, editor?.getCursor().line];
			}),
		)
		.toEqual(["notes/source.md", 2]);
});

test("Open vault audit list opens a table palette in Vault audit", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-vault-audit-list");
	await expect
		.poll(() =>
			obsidian.evaluateApp(() =>
				app.workspace
					.getLeavesOfType("my-palette-table")
					.map((leaf) => leaf.view.getState().input),
			),
		)
		.toEqual(["a "]);
	// A second run brings the same table to the front instead of opening another.
	await runPaletteCommand(obsidian, "open-vault-audit-list");
	expect(
		await obsidian.evaluateApp(() => app.workspace.getLeavesOfType("my-palette-table").length),
	).toBe(1);
});

test("the table palette shows the columns of the chosen kind", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-vault-audit-list");
	const page = obsidian.page;
	const table = page.locator('.workspace-leaf-content[data-type="my-palette-table"]');
	const headers = table.locator("table.my-palette-results-table th");
	await expect(headers).toHaveText(["Name", "Path", "Size", "Modified"]);

	await table.locator(".my-palette-options-button").click();
	await page.locator(".menu .menu-item").filter({ hasText: "Broken links" }).first().click();
	await expect(headers).toHaveText(["Link", "Linked from", "First source"]);
	await expect(table.locator("table.my-palette-results-table tbody tr")).toHaveCount(1);
	await expect(table.locator('td[data-column="firstSource"]')).toHaveText("notes/source.md");
});

test.describe("moving items", () => {
	test.beforeEach(async ({ obsidian }) => {
		// Why: keep trashed files inside the test vault instead of the system trash.
		await obsidian.evaluateApp(() =>
			(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
				"trashOption",
				"local",
			),
		);
	});

	test("the CLI refuses to move without a glob and with both actions", async ({ obsidian }) => {
		expect(
			(await runAuditCli(obsidian, { kind: "orphaned-files", trash: "true" })).error,
		).toContain("glob");
		expect(
			(
				await runAuditCli(obsidian, {
					kind: "orphaned-files",
					glob: "**",
					trash: "true",
					archive: "true",
				})
			).error,
		).toContain("not both");
		expect(
			(await runAuditCli(obsidian, { kind: "broken-links", glob: "**", trash: "true" }))
				.error,
		).toContain("cannot be moved");
		expect(await obsidian.exists("notes/orphan.md")).toBe(true);
	});

	test("the CLI moves only the matching items to the trash", async ({ obsidian }) => {
		const report = await runAuditCli(obsidian, {
			kind: "orphaned-files",
			glob: "notes/orphan.md",
			trash: "true",
		});
		expect(report.items).toEqual([
			expect.objectContaining({ path: "notes/orphan.md", result: "trashed" }),
		]);
		expect(await obsidian.exists("notes/orphan.md")).toBe(false);
		expect(await obsidian.exists("notes/source.md")).toBe(true);
	});

	test("the CLI archives files under the archive folder, keeping their paths", async ({
		obsidian,
	}) => {
		await obsidian.evaluateApp(async () => {
			const plugin = app.plugins.plugins["my-palette"] as unknown as {
				settings: { audit: { archiveFolder: string } };
				saveSettings(): Promise<void>;
			};
			plugin.settings.audit.archiveFolder = "Archive";
			await plugin.saveSettings();
		});
		const report = await runAuditCli(obsidian, {
			kind: "empty-files",
			glob: "notes/**",
			archive: "true",
		});
		expect(report.items).toEqual([
			expect.objectContaining({ path: "notes/frontmatter-only.md", result: "archived" }),
		]);
		expect(await obsidian.exists("Archive/notes/frontmatter-only.md")).toBe(true);
		// Archived files are not listed again.
		expect((await runAuditCli(obsidian, { kind: "empty-files" })).items).toEqual([]);
	});

	test("moves a multi-selection to the trash at once", async ({ obsidian }) => {
		const page = await openHomeWith(obsidian, "a ");
		const rows = page.locator(".my-palette-suggest-modal .suggestion-item");
		await expect.poll(() => rows.count()).toBeGreaterThan(2);
		const [first, second] = (await rowLabels(page)).slice(0, 2);
		await rows.nth(0).click();
		await rows.nth(1).click({ modifiers: ["Shift"] });
		await rows.nth(1).click({ button: "right" });
		await expect(page.locator(".menu .menu-item").first()).toContainText("2 items selected");
		await page.locator(".menu .menu-item").filter({ hasText: "Move to trash" }).click();
		await page.locator(".menu .menu-item.mod-cta").click();
		const remaining = () =>
			obsidian.evaluateApp(
				(names) => app.vault.getFiles().filter((file) => names.includes(file.name)).length,
				[first!, second!],
			);
		await expect.poll(remaining).toBe(0);
	});

	test("Move to trash in the row menu needs a second press", async ({ obsidian }) => {
		const page = await openHomeWith(obsidian, "a orphan");
		await expect.poll(() => rowLabels(page)).toEqual(["orphan.md"]);
		await page
			.locator(".my-palette-suggest-modal .suggestion-item")
			.first()
			.click({ button: "right" });
		await page.locator(".menu .menu-item").filter({ hasText: "Move to trash" }).click();
		await expect(page.locator(".menu .menu-item.mod-cta")).toContainText(
			"Click again to move 1 file to trash",
		);
		expect(await obsidian.exists("notes/orphan.md")).toBe(true);
		await page.locator(".menu .menu-item.mod-cta").click();
		await expect.poll(() => obsidian.exists("notes/orphan.md")).toBe(false);
		await expect.poll(() => rowLabels(page)).toEqual([]);
	});
});

test.describe("MOC-only notes", () => {
	const frontmatter = ["---", "createdAt: 2026-10-08T16:21:43", "---"];

	test.beforeEach(async ({ obsidian }) => {
		await obsidian.evaluateApp(() =>
			(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
				"trashOption",
				"local",
			),
		);
		await writeRaw(
			obsidian,
			"moc/hub.md",
			["## MOC", "- Relateds", "    - [[blank]]", "    - [[written]]", "- References"].join(
				"\n",
			),
		);
		await writeRaw(
			obsidian,
			"moc/blank.md",
			[
				...frontmatter,
				"## MOC",
				"- Relateds",
				"    - [[hub]]",
				"- References",
				"    - [Chat](https://chatgpt.com/c/1)",
			].join("\n"),
		);
		await writeRaw(
			obsidian,
			"moc/written.md",
			[...frontmatter, "A thought.", "", "## MOC", "- Relateds", "    - [[hub]]"].join("\n"),
		);
		await waitForResolvedLinks(obsidian, {
			"moc/hub.md": ["moc/blank.md", "moc/written.md"],
			"moc/blank.md": ["moc/hub.md"],
		});
	});

	async function setMocOnlyAsEmpty(obsidian: ObsidianAPI, value: boolean): Promise<void> {
		await obsidian.evaluateApp(async (value) => {
			const plugin = app.plugins.plugins["my-palette"] as unknown as {
				settings: { audit: { mocOnlyAsEmpty: boolean } };
				saveSettings(): Promise<void>;
			};
			plugin.settings.audit.mocOnlyAsEmpty = value;
			await plugin.saveSettings();
		}, value);
	}

	test("are listed as empty files only when the option is on", async ({ obsidian }) => {
		expect(
			(await runAuditCli(obsidian, { kind: "empty-files", glob: "moc/**" })).items,
		).toEqual([]);
		await setMocOnlyAsEmpty(obsidian, true);
		const report = await runAuditCli(obsidian, { kind: "empty-files", glob: "moc/**" });
		expect(report.items).toEqual([
			expect.objectContaining({ path: "moc/blank.md", mocOnly: { references: 1 } }),
			// A hub that only lists links is MOC-only too; a tag can leave it out.
			expect.objectContaining({ path: "moc/hub.md", mocOnly: { references: 0 } }),
		]);
	});

	test("moving one to the trash removes it from its partners' Relateds", async ({ obsidian }) => {
		await setMocOnlyAsEmpty(obsidian, true);
		const report = await runAuditCli(obsidian, {
			kind: "empty-files",
			glob: "moc/blank.md",
			trash: "true",
		});
		expect(report.items).toEqual([
			expect.objectContaining({ result: "trashed", unlinkedFrom: ["moc/hub.md"] }),
		]);
		expect(await obsidian.exists("moc/blank.md")).toBe(false);
		const hub = await obsidian.read("moc/hub.md");
		expect(hub).not.toContain("[[blank]]");
		expect(hub).toContain("[[written]]");
	});

	test("the MOC remove selector marks notes that are still blank", async ({ obsidian }) => {
		await obsidian.open("moc/hub.md");
		await runPaletteCommand(obsidian, "open-moc-remove-selector");
		const rows = obsidian.page.locator(".my-palette-suggest-modal .suggestion-item");
		await expect(rows).toHaveCount(2);
		// The marks do not depend on the Vault audit option.
		await expect(
			rows.filter({ hasText: "blank" }).locator(".my-palette-suggestion__badge"),
		).toHaveText("MOC only");
		await expect(
			rows.filter({ hasText: "written" }).locator(".my-palette-suggestion__badge"),
		).toHaveCount(0);
	});
});
