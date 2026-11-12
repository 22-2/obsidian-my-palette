import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("タグ一括 CLI は本文とフロントマターを変更・削除する", async ({ obsidian }) => {
	await writeRaw(obsidian, "note.md", "---\ntags: [old]\n---\n本文 #old/child\n");
	const hasTag = (name: string) =>
		obsidian.evaluateApp(
			(tag) =>
				Object.keys(app.metadataCache.getTags()).some(
					(key) => key.toLowerCase() === `#${tag}`,
				),
			name,
		);
	await expect.poll(() => hasTag("old/child")).toBe(true);
	const run = async (action: string, params: Record<string, string>) => {
		const output = await obsidian.evaluateApp(
			({ command, params }) => {
				const cli = (
					app as unknown as {
						cli: {
							handlers: Map<string, { handler(params: unknown): Promise<string> }>;
						};
					}
				).cli;
				return cli.handlers.get(command)!.handler(params);
			},
			{ command: `${PLUGIN_ID}:${action}`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			blocked?: boolean;
			items: { result?: string }[];
		};
	};
	const rename = { from: "old", to: "new" };
	const first = await run("rename-tag", rename);
	expect(first.blocked).toBe(false);
	expect(
		(await run("rename-tag", { ...rename, apply: "true", plan: first.plan })).items[0].result,
	).toBe("changed");
	await expect.poll(() => hasTag("new/child")).toBe(true);
	await expect
		.poll(() =>
			obsidian.evaluateApp(async () => {
				const file = app.vault.getFileByPath("note.md")!;
				const cache = app.metadataCache.getFileCache(file);
				const content = await app.vault.read(file);
				const entry = cache?.tags?.find((tag) => tag.tag === "#new/child");
				return Boolean(
					entry &&
					content.slice(entry.position.start.offset, entry.position.end.offset) ===
						entry.tag &&
					Array.isArray(cache?.frontmatter?.tags) &&
					cache.frontmatter.tags.includes("new"),
				);
			}),
		)
		.toBe(true);
	const remove = { tags: '["new"]' };
	const second = await run("delete-tags", remove);
	expect(second.blocked).toBe(false);
	expect(
		(await run("delete-tags", { ...remove, apply: "true", plan: second.plan })).items[0].result,
	).toBe("changed");
	const content = await obsidian.read("note.md");
	expect(content).not.toContain("#new/child");
	expect(content).not.toContain("tags:");
});
