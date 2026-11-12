import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, writeRaw } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("MOC CLI は相互リンクを確認してから追加する", async ({ obsidian }) => {
	await writeRaw(obsidian, "MOC.md", "## MOC\n- Relateds\n");
	await writeRaw(obsidian, "Note.md", "## MOC\n- Relateds\n");
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
			{ command: `${PLUGIN_ID}:insert-moc-relateds`, params },
		);
		return JSON.parse(output) as {
			plan: string;
			blocked?: boolean;
			files: { result?: string }[];
		};
	};
	const params = { paths: '["Note.md"]', moc: "MOC.md" };
	const preview = await run(params);
	expect(preview.blocked).toBe(false);
	const result = await run({ ...params, apply: "true", plan: preview.plan });
	expect(result.files.map((file) => file.result)).toEqual(["updated", "updated"]);
	expect(await obsidian.read("MOC.md")).toContain("[[Note]]");
	expect(await obsidian.read("Note.md")).toContain("[[MOC]]");
});
