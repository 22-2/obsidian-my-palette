import picomatch from "picomatch";
import type { CliApi } from "src/app/registerCli";
import { auditExclusions, collectAuditSnapshot } from "src/audit/auditSnapshot";
import {
	AUDIT_KINDS,
	filterAuditReport,
	isAuditKind,
	runAudit,
	type AuditReport,
} from "src/audit/vaultAudit";

export const auditCliApi: CliApi = {
	action: "audit",
	description:
		"List orphaned files, broken links, empty files or empty folders as JSON. Does not modify the vault.",
	flags: {
		kind: {
			value: `<${AUDIT_KINDS.join("|")}>`,
			description: "What to list",
			required: true,
		},
		glob: {
			value: "<pattern>",
			description:
				"Keep results whose vault-relative path matches (for broken links, the path of the linking note)",
		},
	},
	run: async (plugin, params) => {
		const { kind, glob } = params;
		if (!isAuditKind(kind))
			throw new Error(`Specify kind as one of: ${AUDIT_KINDS.join(", ")}.`);
		const report = runAudit(
			kind,
			collectAuditSnapshot(plugin.app),
			auditExclusions(plugin.app, plugin.settings),
		);
		const filtered =
			glob === undefined
				? report
				: filterAuditReport(report, picomatch(glob.replaceAll("\\", "/")));
		return { kind, count: filtered.items.length, items: toCliItems(filtered) };
	},
};

/** Lines are one-based in the CLI, as editors show them. */
function toCliItems(report: AuditReport): unknown[] {
	if (report.kind !== "broken-links") return report.items;
	return report.items.map(({ link, sources }) => ({
		link,
		sources: sources.map(({ path, line }) =>
			line === undefined ? { path } : { path, line: line + 1 },
		),
	}));
}
