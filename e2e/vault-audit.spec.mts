import { expect, test, type ObsidianAPI } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, waitForResolvedLinks, writeRaw } from "./support.mts";

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
