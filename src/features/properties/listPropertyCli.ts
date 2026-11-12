import type { CliApi } from "src/platform/cliApi";
import { getFrontMatterInfo, parseYaml, TFile } from "obsidian";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/platform/cliPlans";
import { t } from "src/i18n";
import {
	isSafeListProperty,
	writeListChangesToFiles,
} from "src/features/properties/listPropertyOperations";

function values(value: string | undefined): string[] {
	if (value === undefined) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(t("cli.property.invalid"));
	}
	if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item))
		throw new Error(t("cli.property.invalid"));
	return [...new Set(parsed as string[])];
}

function listFromContent(content: string, key: string): string[] {
	const info = getFrontMatterInfo(content);
	const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
	if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed)))
		throw new Error(t("cli.property.invalidValue"));
	const value: unknown = parsed ? (parsed as Record<string, unknown>)[key] : undefined;
	if (!isSafeListProperty(value)) throw new Error(t("cli.property.invalidValue"));
	return value ?? [];
}

export const listPropertyCliApi: CliApi = {
	action: "edit-list-property",
	description: t("cli.property.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		key: { value: "<key>", description: t("cli.property.keyFlag"), required: true },
		add: { value: "<json>", description: t("cli.property.addFlag") },
		remove: { value: "<json>", description: t("cli.property.removeFlag") },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const key = params.key;
		if (!key || ["tags", "__proto__", "constructor", "prototype"].includes(key.toLowerCase()))
			throw new Error(t("cli.property.invalid"));
		const changes = { add: values(params.add), remove: values(params.remove) };
		if (
			(!changes.add.length && !changes.remove.length) ||
			changes.add.some((value) => changes.remove.includes(value))
		)
			throw new Error(t("cli.property.invalid"));
		const snapshots = await Promise.all(
			paths.map(async (path) => {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension !== "md")
					throw new Error(t("noteDelete.error.missing") + `: ${path}`);
				return { file, path, content: await app.vault.read(file) };
			}),
		);
		const items = snapshots.map(({ path, content }) => {
			const before = listFromContent(content, key);
			const after = [
				...before.filter((value) => !changes.remove.includes(value)),
				...changes.add.filter((value) => !before.includes(value)),
			];
			return {
				path,
				before,
				after,
				deleteKey: after.length === 0,
				contentHash: cliPlanHash(content),
			};
		});
		const plan = cliPlanHash({ key, changes, items });
		if (params.apply !== "true") return { action: "preview", key, plan, items };
		requireCliPlan(params.plan, plan);
		const expected = new Map(snapshots.map(({ path, content }) => [path, content]));
		return {
			action: "edit-list-property",
			key,
			plan,
			items: await writeListChangesToFiles(
				app,
				snapshots.map(({ file }) => file),
				key,
				changes,
				expected,
			),
		};
	},
};
