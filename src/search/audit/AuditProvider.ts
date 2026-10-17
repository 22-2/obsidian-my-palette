import { TFile, type App } from "obsidian";
import { AUDIT_KIND_ICONS } from "src/audit/auditKinds";
import { emptyFileLabel } from "src/audit/noteEmptiness";
import { auditExclusions, collectAuditSnapshot } from "src/audit/auditSnapshot";
import { runAudit, type AuditKind, type AuditReport } from "src/audit/vaultAudit";
import type { AuditResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { formatSize } from "src/shared/fileSize";
import type { MyPaletteSettings } from "src/settings/model";

/**
 * Lists the kind chosen in the options menu. The audit runs on every search: views already
 * search again on vault changes, and a cached report would go stale between them.
 */
export class AuditProvider implements PaletteProvider<AuditResult> {
	constructor(
		private readonly app: App,
		private readonly settings: () => MyPaletteSettings,
	) {}

	async search({ query, includeIgnored = false }: PaletteSearchRequest): Promise<AuditResult[]> {
		const settings = this.settings();
		const report = runAudit(
			settings.audit.kind,
			await collectAuditSnapshot(this.app),
			auditExclusions(this.app, settings, includeIgnored),
		);
		const results = toAuditResults(report, (path) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			return file instanceof TFile ? file : undefined;
		});
		if (!query.trim()) return results;
		// Why: the path (or the link text) is what distinguishes rows; names repeat across folders.
		return searchFuzzyQuery(query, results, [searchKey]).map(({ obj }) => obj);
	}
}

/** Builds palette rows from a report; files that vanished since the snapshot are dropped. */
export function toAuditResults(
	report: AuditReport,
	getFile: (path: string) => TFile | undefined,
): AuditResult[] {
	const icon = AUDIT_KIND_ICONS[report.kind];
	switch (report.kind) {
		case "orphaned-files":
		case "empty-files": {
			const kind: Extract<AuditKind, "orphaned-files" | "empty-files"> = report.kind;
			return report.items.flatMap(({ path, size, mocOnly }): AuditResult[] => {
				const file = getFile(path);
				if (!file) return [];
				const details = [path, formatSize(size)];
				// Why: Empty files mixes blank notes with MOC-only ones; the mark tells them apart.
				if (kind === "empty-files") details.push(emptyFileLabel(mocOnly));
				return [
					{
						id: `audit:${kind}:${path}`,
						mode: "audit",
						kind,
						primary: file.name,
						secondary: details.join(" · "),
						icon,
						file,
						size,
						...(mocOnly ? { mocOnly } : {}),
					},
				];
			});
		}
		case "broken-links":
			return report.items.map(({ link, sources }) => ({
				id: `audit:broken-links:${link}`,
				mode: "audit",
				kind: "broken-links",
				primary: link,
				secondary: `${countLabel(new Set(sources.map(({ path }) => path)).size, "note")} · ${sources[0].path}`,
				icon,
				link,
				sources,
			}));
		case "empty-folders":
			return report.items.map(({ path, foldersInside }) => ({
				id: `audit:empty-folders:${path}`,
				mode: "audit",
				kind: "empty-folders",
				primary: path.split("/").at(-1) ?? path,
				secondary:
					foldersInside > 0
						? `${path} · ${countLabel(foldersInside, "folder")} inside`
						: path,
				icon,
				folderPath: path,
				foldersInside,
			}));
	}
}

function searchKey(result: AuditResult): string {
	switch (result.kind) {
		case "orphaned-files":
		case "empty-files":
			return result.file.path;
		case "broken-links":
			return result.link;
		case "empty-folders":
			return result.folderPath;
	}
}

function countLabel(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
