import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("削除 CLI はノートの内容を確認してからゴミ箱に移す", async ({ obsidian }) => {
	await writeRaw(obsidian, "notes/note.md", "本文");
	await obsidian.evaluateApp(() => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
			"trashOption",
			"local",
		);
	});
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
			{ command: `${PLUGIN_ID}:trash-notes`, params },
		);
		return JSON.parse(output) as { plan: string; items: { result?: string }[] };
	};
	const params = { paths: '["notes/note.md"]' };
	const preview = await run(params);
	expect(await obsidian.exists("notes/note.md")).toBe(true);
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("trashed");
	expect(await obsidian.exists("notes/note.md")).toBe(false);
});
