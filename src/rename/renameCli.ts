import type { CliData } from "obsidian";
import type { CliApi } from "src/app/registerCli";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/app/cliPlans";
import { t } from "src/i18n";
import { renameFiles } from "src/rename/renameFiles";
import { isBlocked, parseRenameRule, planRename } from "src/rename/renamePlan";

export const renameCliApi: CliApi = {
	action: "rename",
	description: t("cli.rename.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		rule: { value: "<find/replace>", description: t("cli.rename.ruleFlag"), required: true },
		regex: { description: t("cli.rename.regexFlag") },
		"ignore-case": { description: t("cli.rename.ignoreCaseFlag") },
		first: { description: t("cli.rename.firstFlag") },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params: CliData) => {
		const paths = cliTargetPaths(plugin.app, params.paths);
		const rule = parseRenameRule(params.rule ?? "", {
			regex: params.regex === "true",
			matchCase: params["ignore-case"] !== "true",
			all: params.first !== "true",
		});
		if (rule.kind !== "rule")
			throw new Error(rule.kind === "error" ? rule.message : t("cli.rename.ruleRequired"));
		const existing = new Set(
			plugin.app.vault.getAllLoadedFiles().map((file) => file.path.toLowerCase()),
		);
		const items = planRename(paths, rule, existing);
		const plan = cliPlanHash(items);
		if (params.apply !== "true")
			return { action: "preview", blocked: isBlocked(items), plan, items };
		requireCliPlan(params.plan, plan);
		if (isBlocked(items)) throw new Error(t("rename.notice.fixMarked"));
		return { action: "rename", plan, items: await renameFiles(plugin.app, items) };
	},
};
