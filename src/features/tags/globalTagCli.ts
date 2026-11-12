import type { CliApi } from "src/platform/cliApi";
import { getFrontMatterInfo, parseYaml, type App, type CliData, type TFile } from "obsidian";
import { cliPlanHash, requireCliPlan } from "src/platform/cliPlans";
import { t } from "src/i18n";
import { normalizeTagName, type InlineTagPosition } from "src/features/tags/tagRename";
import {
	applyTagEdit,
	deleteTagEdit,
	findTagTargets,
	renameTagEdit,
	type TagEdit,
} from "src/features/tags/tagRenameFiles";

function namesFromParams(value: string | undefined): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value ?? "");
	} catch {
		throw new Error(t("cli.globalTag.invalid"));
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length === 0 ||
		parsed.some((item) => typeof item !== "string")
	)
		throw new Error(t("cli.globalTag.invalid"));
	const names = parsed.map((item: string) => normalizeTagName(item));
	if (names.some((name) => !name)) throw new Error(t("cli.globalTag.invalid"));
	return [...new Set(names as string[])].sort();
}

function frontmatterChanges(
	content: string,
	edit: TagEdit,
): { key: string; before: unknown; after: unknown }[] {
	const info = getFrontMatterInfo(content);
	const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
	if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed)))
		throw new Error(t("cli.tag.invalidValue"));
	const frontmatter = (parsed ?? {}) as Record<string, unknown>;
	const changes: { key: string; before: unknown; after: unknown }[] = [];
	for (const key of ["tags", "tag", "aliases", "alias"]) {
		if (!(key in frontmatter)) continue;
		const before = frontmatter[key];
		const result =
			key === "tags" || key === "tag"
				? edit.frontmatter(before)
				: Array.isArray(before)
					? edit.aliases(before)
					: undefined;
		if (result?.changed)
			changes.push({ key, before, after: result.values.length ? result.values : null });
	}
	return changes;
}

async function createPlan(app: App, files: readonly TFile[], edit: TagEdit) {
	return Promise.all(
		files.map(async (file) => {
			const content = await app.vault.read(file);
			const positions: InlineTagPosition[] = (
				app.metadataCache.getFileCache(file)?.tags ?? []
			)
				.filter((tag) => edit.matches(tag.tag.slice(1)))
				.map((tag) => ({
					tag: tag.tag,
					start: tag.position.start.offset,
					end: tag.position.end.offset,
				}));
			const inline = edit.inline(content, positions);
			return {
				file,
				path: file.path,
				content,
				positions,
				inline,
				properties: frontmatterChanges(content, edit),
			};
		}),
	);
}

function api(operation: "rename" | "delete"): CliApi {
	const action = operation === "rename" ? "rename-tag" : "delete-tags";
	return {
		action,
		description: t(
			operation === "rename"
				? "cli.globalTag.renameDescription"
				: "cli.globalTag.deleteDescription",
		),
		flags: {
			...(operation === "rename"
				? {
						from: {
							value: "<tag>",
							description: t("cli.globalTag.fromFlag"),
							required: true,
						},
						to: {
							value: "<tag>",
							description: t("cli.globalTag.toFlag"),
							required: true,
						},
					}
				: {
						tags: {
							value: "<json>",
							description: t("cli.globalTag.tagsFlag"),
							required: true,
						},
					}),
			apply: { description: t("cli.rename.applyFlag") },
			plan: { value: "<hash>", description: t("cli.rename.planFlag") },
		},
		run: async (plugin, params: CliData) => {
			const from = operation === "rename" ? normalizeTagName(params.from ?? "") : undefined;
			const to = operation === "rename" ? normalizeTagName(params.to ?? "") : undefined;
			if (operation === "rename" && (!from || !to || from === to))
				throw new Error(t("cli.globalTag.invalid"));
			const names = operation === "rename" ? [from!] : namesFromParams(params.tags);
			const edit = operation === "rename" ? renameTagEdit(from!, to!) : deleteTagEdit(names);
			const files = findTagTargets(plugin.app, names).sort((a, b) =>
				a.path.localeCompare(b.path),
			);
			const snapshots = await createPlan(plugin.app, files, edit);
			const items = snapshots.map(({ path, content, positions, inline, properties }) => ({
				path,
				contentHash: cliPlanHash(content),
				positions,
				inlineCount: inline?.count ?? 0,
				stale: inline === undefined,
				properties,
			}));
			const blocked = items.some((item) => item.stale);
			const plan = cliPlanHash({ action, names, to, items });
			if (params.apply !== "true")
				return {
					action: "preview",
					operation: action,
					names,
					...(to ? { to } : {}),
					plan,
					blocked,
					items,
				};
			requireCliPlan(params.plan, plan);
			if (blocked) throw new Error(t("cli.globalTag.stale"));
			const results: {
				path: string;
				result: string;
				reason?: string;
				partialPossible?: boolean;
			}[] = [];
			for (const snapshot of snapshots) {
				let editing = false;
				try {
					if (
						snapshot.file.path !== snapshot.path ||
						(await plugin.app.vault.read(snapshot.file)) !== snapshot.content
					)
						throw new Error(t("merge.error.changed"));
					editing = true;
					const result = await applyTagEdit(plugin.app, snapshot.file, edit);
					results.push({ path: snapshot.path, result });
				} catch (error) {
					results.push({
						path: snapshot.path,
						result: "failed",
						reason: error instanceof Error ? error.message : String(error),
						partialPossible: editing,
					});
				}
			}
			return { action, plan, items: results };
		},
	};
}

export const renameTagCliApi = api("rename");
export const deleteTagsCliApi = api("delete");
