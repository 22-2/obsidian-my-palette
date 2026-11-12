import { createHash } from "node:crypto";
import { TFile, type App } from "obsidian";
import { t } from "src/i18n";

/** CLI では明示された既存ファイルだけを対象にする。 */
export function cliTargetPaths(app: App, value: string | undefined): string[] {
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

export function cliPlanHash(plan: unknown): string {
	return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

export function requireCliPlan(expected: string | undefined, actual: string): void {
	if (!expected || expected !== actual) throw new Error(t("cli.rename.planChanged"));
}
