import type { CliApi } from "src/platform/cliApi";
import { getFrontMatterInfo, parseYaml, TFile } from "obsidian";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/platform/cliPlans";
import { checkPropertyInput } from "src/properties/propertyInput";
import {
	isCompatibleScalar,
	writeScalarProperty,
	type ScalarPropertyKind,
	type ScalarPropertyValue,
} from "src/properties/scalarPropertyOperations";
import { t } from "src/i18n";

function parseValue(
	kind: string | undefined,
	value: string | undefined,
): { kind: ScalarPropertyKind; value: ScalarPropertyValue } {
	if (value === undefined) throw new Error(t("cli.scalar.invalid"));
	if (kind === "checkbox") {
		if (value !== "true" && value !== "false") throw new Error(t("cli.scalar.invalid"));
		return { kind, value: value === "true" };
	}
	if (kind !== "text" && kind !== "number" && kind !== "date" && kind !== "datetime")
		throw new Error(t("cli.scalar.invalid"));
	const checked = checkPropertyInput(kind, value);
	if (!checked.ok) throw new Error(checked.reason);
	return { kind, value: checked.value };
}

function propertyFromContent(
	content: string,
	key: string,
	kind: ScalarPropertyKind,
): { exists: boolean; before: unknown } {
	const info = getFrontMatterInfo(content);
	const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
	if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed)))
		throw new Error(t("cli.scalar.invalidValue"));
	const frontmatter = (parsed ?? {}) as Record<string, unknown>;
	const exists = Object.hasOwn(frontmatter, key);
	const before = exists ? frontmatter[key] : undefined;
	if (!isCompatibleScalar(before, kind)) throw new Error(t("cli.scalar.invalidValue"));
	return { exists, before };
}

export const scalarPropertyCliApi: CliApi = {
	action: "set-property",
	description: t("cli.scalar.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		key: { value: "<key>", description: t("cli.scalar.keyFlag"), required: true },
		kind: {
			value: "<text|number|checkbox|date|datetime>",
			description: t("cli.scalar.kindFlag"),
			required: true,
		},
		value: { value: "<value>", description: t("cli.scalar.valueFlag"), required: true },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const key = params.key;
		if (
			!key ||
			["tags", "aliases", "cssclasses", "__proto__", "constructor", "prototype"].includes(
				key.toLowerCase(),
			)
		)
			throw new Error(t("cli.scalar.invalid"));
		const { kind, value } = parseValue(params.kind, params.value);
		const snapshots = await Promise.all(
			paths.map(async (path) => {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension !== "md")
					throw new Error(t("noteDelete.error.missing") + `: ${path}`);
				return { file, path, content: await app.vault.read(file) };
			}),
		);
		const items = snapshots.map(({ path, content }) => ({
			path,
			...propertyFromContent(content, key, kind),
			after: value,
			contentHash: cliPlanHash(content),
		}));
		const plan = cliPlanHash({ key, kind, value, items });
		if (params.apply !== "true") return { action: "preview", key, kind, plan, items };
		requireCliPlan(params.plan, plan);
		const results: { path: string; result: "updated" | "failed"; reason?: string }[] = [];
		for (const snapshot of snapshots) {
			if (snapshot.file.path !== snapshot.path) {
				results.push({
					path: snapshot.path,
					result: "failed",
					reason: t("merge.error.changed"),
				});
				continue;
			}
			const result = await writeScalarProperty(app, snapshot.file, key, value, {
				kind,
				expectedContent: snapshot.content,
			});
			results.push(
				result.ok
					? { path: snapshot.path, result: "updated" }
					: { path: snapshot.path, result: "failed", reason: result.reason },
			);
		}
		return { action: "set-property", key, kind, plan, items: results };
	},
};
