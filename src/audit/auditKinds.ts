import type { IconName } from "obsidian";
import type { AuditKind } from "src/audit/vaultAudit";
import { ICONS } from "src/ui/icons";

/** UI names of the kinds, as in docs/GLOSSARY.md. */
export const AUDIT_KIND_LABELS: Readonly<Record<AuditKind, string>> = {
	"orphaned-files": "Orphaned files",
	"broken-links": "Broken links",
	"empty-files": "Empty files",
	"empty-folders": "Empty folders",
};

export const AUDIT_KIND_ICONS: Readonly<Record<AuditKind, IconName>> = {
	"orphaned-files": ICONS.orphanedFile,
	"broken-links": ICONS.brokenLink,
	"empty-files": ICONS.file,
	"empty-folders": ICONS.emptyFolder,
};

export function auditPlaceholder(kind: AuditKind): string {
	return `Search ${AUDIT_KIND_LABELS[kind].toLocaleLowerCase()}`;
}
