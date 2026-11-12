import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("名前変更 CLI は計画を確認してから実行する", async ({ obsidian }) => {
	await writeRaw(obsidian, "notes/old.md", "本文");
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
			{ command: `${PLUGIN_ID}:rename`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			blocked?: boolean;
			error?: string;
			items: { path: string; newPath: string; result?: string }[];
		};
	};
	const params = { paths: '["notes/old.md"]', rule: "old/new" };
	const preview = await run(params);
	expect(preview.blocked).toBe(false);
	expect(preview.items[0].newPath).toBe("notes/new.md");
	expect(await obsidian.exists("notes/old.md")).toBe(true);
	const missingPlan = await run({ ...params, apply: "true" });
	expect(missingPlan.error).toContain("計画が一致しません");
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("renamed");
	expect(await obsidian.exists("notes/new.md")).toBe(true);
});
