import { createHash } from "node:crypto";
import { TFile, type App, type CliData } from "obsidian";
import type { CliApi } from "src/app/registerCli";
import { t } from "src/i18n";
import { renameFiles } from "src/rename/renameFiles";
import { isBlocked, parseRenameRule, planRename } from "src/rename/renamePlan";

function pathsFromParams(app: App, value: string | undefined): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value ?? "");
	} catch {
		throw new Error(t("cli.rename.pathsRequired"));
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length === 0 ||
		parsed.some((path) => typeof path !== "string" || !path)
	)
		throw new Error(t("cli.rename.pathsRequired"));
	const paths = [...new Set(parsed as string[])].sort();
	for (const path of paths)
		if (!(app.vault.getAbstractFileByPath(path) instanceof TFile))
			throw new Error(t("cli.rename.fileMissing", { path }));
	return paths;
}

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
		const paths = pathsFromParams(plugin.app, params.paths);
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
		const plan = createHash("sha256").update(JSON.stringify(items)).digest("hex");
		if (params.apply !== "true")
			return { action: "preview", blocked: isBlocked(items), plan, items };
		if (!params.plan || params.plan !== plan) throw new Error(t("cli.rename.planChanged"));
		if (isBlocked(items)) throw new Error(t("rename.notice.fixMarked"));
		return { action: "rename", plan, items: await renameFiles(plugin.app, items) };
	},
};
