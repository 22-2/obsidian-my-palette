import { getFrontMatterInfo, parseYaml, TFile } from "obsidian";
import type { CliApi } from "src/app/registerCli";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/app/cliPlans";
import { t } from "src/i18n";
import { tagKey } from "src/core/tagKey";
import { normalizeTagName } from "src/tags/tagRename";
import { applyTagChangesToFiles, isSafeTagValue } from "src/tags/tagOperations";
import {
	mergeFrontmatterTags,
	normalizeFrontmatterTags,
	removeFrontmatterTags,
} from "src/core/frontmatter";

function tagsFromContent(content: string): string[] {
	const info = getFrontMatterInfo(content);
	const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
	if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed)))
		throw new Error(t("cli.tag.invalidValue"));
	const value: unknown = parsed ? (parsed as Record<string, unknown>).tags : undefined;
	if (!isSafeTagValue(value)) throw new Error(t("cli.tag.invalidValue"));
	return normalizeFrontmatterTags(value);
}

function parseTags(value: string | undefined): string[] {
	if (value === undefined) return [];
	let raw: unknown;
	try {
		raw = JSON.parse(value);
	} catch {
		throw new Error(t("cli.tag.invalid"));
	}
	if (!Array.isArray(raw) || raw.some((tag) => typeof tag !== "string"))
		throw new Error(t("cli.tag.invalid"));
	const tags = raw.map((tag: string) => normalizeTagName(tag));
	if (tags.some((tag) => !tag)) throw new Error(t("cli.tag.invalid"));
	return [...new Map(tags.map((tag) => [tagKey(tag!), tag!])).values()];
}

export const tagCliApi: CliApi = {
	action: "edit-tags",
	description: t("cli.tag.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		add: { value: "<json>", description: t("cli.tag.addFlag") },
		remove: { value: "<json>", description: t("cli.tag.removeFlag") },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const changes = { add: parseTags(params.add), remove: parseTags(params.remove) };
		if (
			(!changes.add.length && !changes.remove.length) ||
			changes.add.some((tag) =>
				changes.remove.some((removed) => tagKey(tag) === tagKey(removed)),
			)
		)
			throw new Error(t("cli.tag.invalid"));
		const snapshots = await Promise.all(
			paths.map(async (path) => {
				const file = app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile) || file.extension !== "md")
					throw new Error(t("noteDelete.error.missing") + `: ${path}`);
				return { file, path, content: await app.vault.read(file) };
			}),
		);
		const items = snapshots.map(({ path, content }) => {
			const before = tagsFromContent(content);
			const added = changes.add.length ? mergeFrontmatterTags(before, changes.add) : before;
			const after = changes.remove.length
				? removeFrontmatterTags(added, changes.remove)
				: added;
			return { path, before, after, contentHash: cliPlanHash(content) };
		});
		const plan = cliPlanHash({ changes, items });
		if (params.apply !== "true") return { action: "preview", plan, changes, items };
		requireCliPlan(params.plan, plan);
		const expected = new Map(snapshots.map(({ path, content }) => [path, content]));
		const expectedTags = new Map(items.map(({ path, before }) => [path, before]));
		return {
			action: "edit-tags",
			plan,
			items: await applyTagChangesToFiles(
				app,
				snapshots.map(({ file }) => file),
				changes,
				expected,
				expectedTags,
			),
		};
	},
};
