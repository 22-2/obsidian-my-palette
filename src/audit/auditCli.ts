import type { CliData } from "obsidian";
import picomatch from "picomatch";
import type { CliApi } from "src/app/registerCli";
import { canTrash, trashAuditItems, type AuditActionResult } from "src/audit/auditActions";
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
		"List orphaned files, broken links, empty files or empty folders as JSON. Lists only, unless trash is passed.",
	flags: {
		kind: {
			value: `<${AUDIT_KINDS.join("|")}>`,
			description: "What to list",
			required: true,
		},
		glob: {
			value: "<pattern>",
			description:
				"Keep results whose vault-relative path matches (for broken links, the path of the linking note). Required with trash",
		},
		trash: {
			description:
				"Move the listed files or folders to the trash (Obsidian's Deleted files setting). Not for broken-links",
		},
	},
	run: async (plugin, params) => {
		const { kind, glob } = params;
		if (!isAuditKind(kind))
			throw new Error(`Specify kind as one of: ${AUDIT_KINDS.join(", ")}.`);
		const trash = requestsTrash(params, kind);
		const report = await auditVault(plugin.app, kind, plugin.settings);
		const filtered =
			glob === undefined
				? report
				: filterAuditReport(report, picomatch(glob.replaceAll("\\", "/")));
		const items = toCliItems(filtered);
		if (!trash || filtered.kind === "broken-links") return { kind, count: items.length, items };
		const results = await trashAuditItems(
			plugin.app,
			kind,
			filtered.items.map(({ path }) => path),
		);
		return { kind, action: "trash", count: items.length, items: withResults(items, results) };
	},
};

/**
 * Checks the flags before anything is listed, so a wrong combination never moves files.
 * Why: a missing glob would act on every result in the vault, which an AI should not do
 * by accident.
 */
function requestsTrash(params: CliData, kind: AuditKind): boolean {
	if (params.trash !== "true") return false;
	if (params.glob === undefined) throw new Error("Pass glob to choose what to trash.");
	if (!canTrash(kind)) throw new Error(`${kind} cannot be moved to trash.`);
	return true;
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
