import type { IconName } from "obsidian";
import type { AuditKind } from "src/audit/vaultAudit";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** 種類の表示名。 */
export const AUDIT_KIND_LABELS: Readonly<Record<AuditKind, string>> = {
	"orphaned-files": t("audit.kind.orphaned-files"),
	"broken-links": t("audit.kind.broken-links"),
	"empty-files": t("audit.kind.empty-files"),
	"empty-folders": t("audit.kind.empty-folders"),
};

export const AUDIT_KIND_ICONS: Readonly<Record<AuditKind, IconName>> = {
	"orphaned-files": ICONS.orphanedFile,
	"broken-links": ICONS.brokenLink,
	"empty-files": ICONS.file,
	"empty-folders": ICONS.emptyFolder,
};

export function auditPlaceholder(kind: AuditKind): string {
	return t("audit.placeholder", { label: AUDIT_KIND_LABELS[kind] });
}
