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
import { t } from "src/i18n";

export const auditCliApi: CliApi = {
	action: "audit",
	description: t("cli.audit.description"),
	flags: {
		kind: {
			value: `<${AUDIT_KINDS.join("|")}>`,
			description: t("cli.audit.kindFlag"),
			required: true,
		},
		glob: {
			value: "<pattern>",
			description: t("cli.audit.globFlag"),
		},
		trash: {
			description: t("cli.audit.trashFlag"),
		},
	},
	run: async (plugin, params) => {
		const { kind, glob } = params;
		if (!isAuditKind(kind))
			throw new Error(t("cli.audit.kindRequired", { kinds: AUDIT_KINDS.join(", ") }));
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
 * 一覧を作る前にフラグを確認する。組み合わせが誤っていれば、ファイルを動かさない。
 * Why: glob がないと Vault のすべての結果が対象になってしまう。AI が誤ってそうしないように。
 */
function requestsTrash(params: CliData, kind: AuditKind): boolean {
	if (params.trash !== "true") return false;
	if (params.glob === undefined) throw new Error(t("cli.audit.globRequired"));
	if (!canTrash(kind)) throw new Error(t("audit.error.notTrashable", { kind }));
	return true;
}

/** CLI の行番号は、エディターが表示するのと同じ1始まり。 */
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
