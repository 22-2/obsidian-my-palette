import type { CliApi } from "src/platform/cliApi";
import { TFile } from "obsidian";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/platform/cliPlans";
import { trashNotes } from "src/features/trash/trashNotes";
import { t } from "src/i18n";

export const trashCliApi: CliApi = {
	action: "trash-notes",
	description: t("cli.trash.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const snapshots = await Promise.all(
			paths.map(async (path) => {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== "md")
					throw new Error(t("noteDelete.error.missing") + `: ${path}`);
				return { path, content: await app.vault.read(file) };
			}),
		);
		const items = snapshots.map(({ path, content }) => ({
			path,
			contentHash: cliPlanHash(content),
		}));
		const plan = cliPlanHash(items);
		if (params.apply !== "true") return { action: "preview", plan, items };
		requireCliPlan(params.plan, plan);
		return {
			action: "trash",
			plan,
			items: await trashNotes(
				app,
				paths,
				new Map(snapshots.map(({ path, content }) => [path, content])),
			),
		};
	},
};
