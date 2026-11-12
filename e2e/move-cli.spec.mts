import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("移動 CLI は確認した計画を実行する", async ({ obsidian }) => {
	await writeRaw(obsidian, "source/note.md", "本文");
	await obsidian.evaluateApp(async () => {
		await app.vault.createFolder("destination");
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
			{ command: `${PLUGIN_ID}:move`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			blocked?: boolean;
			items: { result?: string; destination?: string }[];
		};
	};
	const params = { paths: '["source/note.md"]', folder: "destination" };
	const preview = await run(params);
	expect(preview.blocked).toBe(false);
	expect(preview.items[0].destination).toBe("destination/note.md");
	expect(await obsidian.exists("source/note.md")).toBe(true);
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("moved");
	expect(await obsidian.exists("destination/note.md")).toBe(true);
});
