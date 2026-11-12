import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("単一値プロパティ CLI は変更を確認してからノートへ設定する", async ({ obsidian }) => {
	await writeRaw(obsidian, "note.md", "---\nscore: 1\n---\n本文\n");
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
			{ command: `${PLUGIN_ID}:set-property`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			items: { before?: unknown; after?: unknown; result?: string }[];
		};
	};
	const params = { paths: '["note.md"]', key: "score", kind: "number", value: "2.5" };
	const preview = await run(params);
	expect(preview.items[0]).toMatchObject({ before: 1, after: 2.5 });
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.items[0].result).toBe("updated");
	expect(await obsidian.read("note.md")).toContain("score: 2.5");
});

test("日付とチェックボックスを実際のフロントマターへ設定する", async ({ obsidian }) => {
	await writeRaw(obsidian, "note.md", "---\ndue: 2026-01-01\ndone: false\n---\n本文\n");
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
			{ command: `${PLUGIN_ID}:set-property`, params },
		);
		return JSON.parse(output) as { plan: string; error?: string; items: { result?: string }[] };
	};
	for (const entry of [
		{ key: "due", kind: "date", value: "2026-02-01" },
		{ key: "done", kind: "checkbox", value: "true" },
	]) {
		const params = { paths: '["note.md"]', ...entry };
		const preview = await run(params);
		expect(preview.error).toBeUndefined();
		const result = await run({ ...params, apply: "true", plan: preview.plan });
		expect(result.items[0].result).toBe("updated");
	}
	const content = await obsidian.read("note.md");
	expect(content).toContain("2026-02-01");
	expect(content).toContain("done: true");
});
