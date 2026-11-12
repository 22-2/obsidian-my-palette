import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("統合 CLI は確認した計画で統合元をマージする", async ({ obsidian }) => {
	await writeRaw(obsidian, "Source.md", "source body");
	await writeRaw(obsidian, "Target.md", "target body");
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
			{ command: `${PLUGIN_ID}:merge-notes`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			merged?: boolean;
			trashed?: number;
			failures?: string[];
		};
	};
	const params = { paths: '["Source.md"]', target: "Target.md" };
	const preview = await run(params);
	expect(await obsidian.exists("Source.md")).toBe(true);
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({ merged: true, trashed: 1, failures: [] });
	expect(await obsidian.read("Target.md")).toContain("source body");
});
