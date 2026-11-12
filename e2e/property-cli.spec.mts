import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("リストプロパティ CLI は変更前後を示してから書き込む", async ({ obsidian }) => {
	await writeRaw(obsidian, "notes/list.md", "---\ntopic: [old]\n---\n本文\n");
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
			{ command: `${PLUGIN_ID}:edit-list-property`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			items: { before?: string[]; after?: string[]; result?: string }[];
		};
	};
	const params = { paths: '["notes/list.md"]', key: "topic", add: '["new"]', remove: '["old"]' };
	const preview = await run(params);
	expect(preview.items[0]).toMatchObject({ before: ["old"], after: ["new"] });
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("updated");
	expect(await obsidian.read("notes/list.md")).toContain("new");
});
