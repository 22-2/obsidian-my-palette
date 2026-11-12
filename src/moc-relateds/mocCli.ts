import { TFile } from "obsidian";
import type { CliApi } from "src/app/registerCli";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/app/cliPlans";
import { executeMocInsertion, planMocInsertion } from "src/moc-relateds/mocOperations";
import { t } from "src/i18n";

export const mocCliApi: CliApi = {
	action: "insert-moc-relateds",
	description: t("cli.moc.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.moc.pathsFlag"), required: true },
		moc: { value: "<path>", description: t("cli.moc.mocFlag"), required: true },
		"one-way": { description: t("cli.moc.oneWayFlag") },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const moc = app.vault.getAbstractFileByPath(params.moc ?? "");
		if (!(moc instanceof TFile) || moc.extension !== "md" || paths.includes(moc.path))
			throw new Error(t("cli.moc.invalid"));
		const targets = paths.map((path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || file.extension !== "md")
				throw new Error(t("cli.moc.invalid"));
			return file;
		});
		const mutual = params["one-way"] !== "true";
		const planned = await planMocInsertion(app, moc, targets, mutual);
		const files = planned.files.map(({ path, before, after }) => ({
			path,
			beforeHash: cliPlanHash(before),
			afterHash: cliPlanHash(after),
			changed: before !== after,
		}));
		const blocked = planned.links.some((link) => link.result === "failed");
		const plan = cliPlanHash({ moc: moc.path, mutual, files, links: planned.links });
		if (params.apply !== "true")
			return { action: "preview", plan, blocked, mutual, files, links: planned.links };
		requireCliPlan(params.plan, plan);
		if (blocked) throw new Error(t("cli.moc.blocked"));
		const results = await executeMocInsertion(app, planned);
		const links = planned.links.map((link) => {
			const file = results.find((result) => result.path === link.from);
			return file?.result === "failed"
				? { ...link, result: "failed", reason: file.reason }
				: link;
		});
		return { action: "insert-moc-relateds", plan, links, files: results };
	},
};
