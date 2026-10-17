import type { App, EventRef, TFile } from "obsidian";
import { AUDIT_KIND_ICONS } from "src/audit/auditKinds";
import { auditExclusions, auditVault } from "src/audit/auditSnapshot";
import type { AuditKind, AuditReport } from "src/audit/vaultAudit";
import type { AuditResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { formatSize } from "src/shared/fileSize";
import type { MyPaletteSettings } from "src/settings/model";

/**
 * Lists the kind chosen in the options menu. The rows are kept until the vault or the
 * metadata cache changes, so typing a query only filters them instead of auditing the
 * whole vault again on each keystroke.
 */
export class AuditProvider implements PaletteProvider<AuditResult> {
	private readonly refs: EventRef[] = [];
	private cached?: { key: string; results: Promise<AuditResult[]> };

	constructor(
		private readonly app: App,
		private readonly settings: () => MyPaletteSettings,
	) {
		const invalidate = (): void => {
			this.cached = undefined;
		};
		const { vault, metadataCache } = app;
		// Why: `modify` covers files the metadata cache does not parse, whose size decides
		// whether they are empty; `resolved` follows link changes across the vault.
		this.refs.push(
			vault.on("create", invalidate),
			vault.on("modify", invalidate),
			vault.on("delete", invalidate),
			vault.on("rename", invalidate),
			metadataCache.on("changed", invalidate),
			metadataCache.on("deleted", invalidate),
			metadataCache.on("resolved", invalidate),
		);
	}

	dispose(): void {
		for (const ref of this.refs) {
			this.app.vault.offref(ref);
			this.app.metadataCache.offref(ref);
		}
		this.refs.length = 0;
		this.cached = undefined;
	}

	async search({ query }: PaletteSearchRequest): Promise<AuditResult[]> {
		const results = await this.currentResults();
		if (!query.trim()) return results;
		// Why: the path (or the link text) is what distinguishes rows; names repeat across folders.
		return searchFuzzyQuery(query, results, [searchKey]).map(({ obj }) => obj);
	}

	/**
	 * Audits again only when the vault changed or the settings did. The key holds the
	 * resolved exclusions, so Obsidian's Excluded files and the core plugin folders count too.
	 */
	private currentResults(): Promise<AuditResult[]> {
		const settings = this.settings();
		const { kind, mocOnlyAsEmpty } = settings.audit;
		const key = JSON.stringify([kind, mocOnlyAsEmpty, auditExclusions(this.app, settings)]);
		if (this.cached?.key === key) return this.cached.results;
		const results = auditVault(this.app, kind, settings).then((report) =>
			toAuditResults(report, (path) => this.app.vault.getFileByPath(path) ?? undefined),
		);
		const cached = { key, results };
		this.cached = cached;
		// Why: a failed audit must not be served again; the next search tries afresh.
		results.catch(() => {
			if (this.cached === cached) this.cached = undefined;
		});
		return results;
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
				if (mocOnly) details.push(mocOnlyLabel(mocOnly.references));
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

function mocOnlyLabel(references: number): string {
	return references > 0 ? `MOC only, ${countLabel(references, "reference")}` : "MOC only";
}

function countLabel(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
