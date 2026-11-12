import { TFile } from "obsidian";
import type { CliApi } from "src/app/registerCli";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/app/cliPlans";
import { executeMerge, planMerge } from "src/merge/mergeNotes";
import { t } from "src/i18n";

export const mergeCliApi: CliApi = {
	action: "merge-notes",
	description: t("cli.merge.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.merge.sourcesFlag"), required: true },
		target: { value: "<path>", description: t("cli.merge.targetFlag"), required: true },
		"no-aliases": { description: t("cli.merge.noAliasesFlag") },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const target = app.vault.getAbstractFileByPath(params.target ?? "");
		if (!(target instanceof TFile) || target.extension !== "md" || paths.includes(target.path))
			throw new Error(t("cli.merge.invalid"));
		const files = paths.map((path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || file.extension !== "md")
				throw new Error(t("cli.merge.invalid"));
			return file;
		});
		const merge = await planMerge(app, files, target);
		merge.aliasSourceNames = params["no-aliases"] !== "true";
		const retargets = await Promise.all(
			merge.retargets.map(async ({ file, count }) => ({
				path: file.path,
				count,
				contentHash: cliPlanHash(await app.vault.read(file)),
			})),
		);
		retargets.sort((a, b) => a.path.localeCompare(b.path));
		const items = merge.snapshots.map(({ path, content }) => ({
			path,
			contentHash: cliPlanHash(content),
		}));
		const summary = {
			target: target.path,
			sources: paths,
			aliasSourceNames: merge.aliasSourceNames,
			conflicts: merge.conflicts,
			retargets,
			items,
		};
		const plan = cliPlanHash({
			...summary,
			body: merge.body,
			sourceProperties: merge.sourceProperties,
		});
		if (params.apply !== "true") return { action: "preview", plan, ...summary };
		requireCliPlan(params.plan, plan);
		return {
			action: "merge",
			plan,
			target: summary.target,
			sources: paths,
			...(await executeMerge(app, merge)),
		};
	},
};
