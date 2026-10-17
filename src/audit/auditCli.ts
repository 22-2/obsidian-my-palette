import type { CliData } from "obsidian";
import picomatch from "picomatch";
import type { CliApi } from "src/app/registerCli";
import {
	applyAuditAction,
	canArchive,
	canTrash,
	type AuditAction,
	type AuditActionResult,
} from "src/audit/auditActions";
import { auditVault } from "src/audit/auditSnapshot";
import {
	AUDIT_KINDS,
	filterAuditReport,
	isAuditKind,
	type AuditKind,
	type AuditReport,
} from "src/audit/vaultAudit";

export const auditCliApi: CliApi = {
	action: "audit",
	description:
		"List orphaned files, broken links, empty files or empty folders as JSON. Lists only, unless trash or archive is passed.",
	flags: {
		kind: {
			value: `<${AUDIT_KINDS.join("|")}>`,
			description: "What to list",
			required: true,
		},
		glob: {
			value: "<pattern>",
			description:
				"Keep results whose vault-relative path matches (for broken links, the path of the linking note). Required with trash or archive",
		},
		trash: {
			description:
				"Move the listed files or folders to the trash (Obsidian's Deleted files setting). Not for broken-links",
		},
		archive: {
			description:
				"Move the listed files into the archive folder, keeping their paths. Only orphaned-files and empty-files",
		},
	},
	run: async (plugin, params) => {
		const { kind, glob } = params;
		if (!isAuditKind(kind))
			throw new Error(`Specify kind as one of: ${AUDIT_KINDS.join(", ")}.`);
		const action = requestedAction(params, kind);
		const report = await auditVault(plugin.app, kind, plugin.settings);
		const filtered =
			glob === undefined
				? report
				: filterAuditReport(report, picomatch(glob.replaceAll("\\", "/")));
		const items = toCliItems(filtered);
		if (!action || filtered.kind === "broken-links")
			return { kind, count: items.length, items };
		const results = await applyAuditAction(
			plugin.app,
			action,
			kind,
			filtered.items.map(({ path }) => path),
			plugin.settings.audit,
		);
		return { kind, action, count: items.length, items: withResults(items, results) };
	},
};

/**
 * Checks the flags before anything is listed, so a wrong combination never moves files.
 * Why: a missing glob would act on every result in the vault, which an AI should not do
 * by accident.
 */
function requestedAction(params: CliData, kind: AuditKind): AuditAction | undefined {
	const trash = params.trash === "true";
	const archive = params.archive === "true";
	if (trash && archive) throw new Error("Pass either trash or archive, not both.");
	const action = trash ? "trash" : archive ? "archive" : undefined;
	if (!action) return undefined;
	if (params.glob === undefined) throw new Error(`Pass glob to choose what to ${action}.`);
	if (action === "trash" && !canTrash(kind)) throw new Error(`${kind} cannot be moved to trash.`);
	if (action === "archive" && !canArchive(kind))
		throw new Error("archive works only with orphaned-files and empty-files.");
	return action;
}

/** Lines are one-based in the CLI, as editors show them. */
function toCliItems(report: AuditReport): object[] {
	if (report.kind !== "broken-links") return report.items;
	return report.items.map(({ link, sources }) => ({
		link,
		sources: sources.map(({ path, line }) =>
			line === undefined ? { path } : { path, line: line + 1 },
		),
	}));
}

function withResults(items: readonly object[], results: readonly AuditActionResult[]) {
	return items.map((item, index) => {
		const { outcome, reason, unlinkedFrom } = results[index];
		return {
			...item,
			result: outcome,
			...(reason ? { reason } : {}),
			...(unlinkedFrom ? { unlinkedFrom } : {}),
		};
	});
}
