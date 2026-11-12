import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("タグ CLI はフロントマターのタグだけを編集する", async ({ obsidian }) => {
	await writeRaw(obsidian, "notes/tagged.md", "---\ntags: [old]\n---\n本文 #old\n");
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					app.metadataCache.getFileCache(app.vault.getFileByPath("notes/tagged.md")!)
						?.frontmatter?.tags,
			),
		)
		.toEqual(["old"]);
	const run = async (params: Record<string, string>) => {
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
			{ command: `${PLUGIN_ID}:edit-tags`, params },
		);
		return JSON.parse(output) as { plan: string; items: { result?: string }[] };
	};
	const params = { paths: '["notes/tagged.md"]', add: '["new"]', remove: '["old"]' };
	const preview = await run(params);
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("updated");
	const content = await obsidian.read("notes/tagged.md");
	expect(content).toContain("new");
	expect(content).toContain("本文 #old");
});
