import type { AuditKind } from "src/audit/vaultAudit";

/** UI names of the kinds, as in docs/GLOSSARY.md. */
export const AUDIT_KIND_LABELS: Readonly<Record<AuditKind, string>> = {
	"orphaned-files": "Orphaned files",
	"broken-links": "Broken links",
	"empty-files": "Empty files",
	"empty-folders": "Empty folders",
};

export const AUDIT_KIND_ICONS: Readonly<Record<AuditKind, string>> = {
	"orphaned-files": "file-question",
	"broken-links": "unlink",
	"empty-files": "file",
	"empty-folders": "folder-x",
};

export function auditPlaceholder(kind: AuditKind): string {
	return `Search ${AUDIT_KIND_LABELS[kind].toLocaleLowerCase()}`;
}
