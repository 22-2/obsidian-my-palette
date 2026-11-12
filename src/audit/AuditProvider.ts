import type { App, EventRef, TFile } from "obsidian";
import { AUDIT_KIND_ICONS } from "src/audit/auditKinds";
import { auditExclusions, auditVault } from "src/audit/auditSnapshot";
import type { AuditKind, AuditReport } from "src/audit/vaultAudit";
import type { AuditResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { formatSize } from "src/shared/fileSize";
import { countLabel } from "src/shared/countLabel";
import type { MyPaletteSettings } from "src/settings/model";
import { t } from "src/i18n";

/** Vault のどの変化が監査結果を変えうるか。種類ごとの依存は `AUDIT_DEPENDENCIES` で決める。 */
type AuditChange = "structure" | "modify" | "metadata" | "resolved";

const AUDIT_DEPENDENCIES: Record<AuditKind, readonly AuditChange[]> = {
	// Why: 浮いたファイルは、ファイルの増減とリンクの解決だけで決まる。本文の保存では変わらない。
	"orphaned-files": ["structure", "resolved"],
	// Why: 壊れたリンクは、ノートのリンクが書き換わったときにも変わる。
	"broken-links": ["structure", "metadata", "resolved"],
	// Why: 空かどうかは、サイズ(modify)とフロントマター以外の中身(metadata)で決まる。
	"empty-files": ["structure", "modify", "metadata"],
	// Why: 空のフォルダーは、ファイルとフォルダーの増減だけで決まる。
	"empty-folders": ["structure"],
};

/**
 * オプションのメニューで選んだ種類を一覧にする。行は、Vault かメタデータキャッシュが変わるまで保持する。
 * そのため、クエリを打つと行を絞り込むだけで、キーを押すたびに Vault 全体を監査し直すことはない。
 */
export class AuditProvider implements PaletteProvider<AuditResult> {
	private readonly refs: EventRef[] = [];
	private cached?: { key: string; kind: AuditKind; results: Promise<AuditResult[]> };

	constructor(
		private readonly app: App,
		private readonly settings: () => MyPaletteSettings,
	) {
		// Why: 今の結果に関係ない変化では捨てない。保存のたびに全件の監査をやり直さないため。
		const invalidate = (change: AuditChange) => (): void => {
			if (this.cached && AUDIT_DEPENDENCIES[this.cached.kind].includes(change)) {
				this.cached = undefined;
			}
		};
		const { vault, metadataCache } = app;
		// Why: `modify` は、メタデータキャッシュが解析しないファイルを覆う。そのサイズで空かどうかが決まる。
		// `resolved` は、Vault 全体のリンクの変更に追従する。
		this.refs.push(
			vault.on("create", invalidate("structure")),
			vault.on("modify", invalidate("modify")),
			vault.on("delete", invalidate("structure")),
			vault.on("rename", invalidate("structure")),
			metadataCache.on("changed", invalidate("metadata")),
			metadataCache.on("deleted", invalidate("metadata")),
			metadataCache.on("resolved", invalidate("resolved")),
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

	async search({ query, includeIgnored = false }: PaletteSearchRequest): Promise<AuditResult[]> {
		const results = await this.currentResults(includeIgnored);
		if (!query.trim()) return results;
		// Why: 行を区別するのはパス(またはリンクの文字列)。名前はフォルダーをまたいで重複する。
		return searchFuzzyQuery(query, results, [searchKey]).map(({ obj }) => obj);
	}

	/**
	 * Vault か設定が変わったときだけ、監査をやり直す。キーは解決済みの除外を保持するので、Obsidian の
	 * 除外ファイルとコアプラグインのフォルダーも数に入る。
	 */
	private currentResults(includeIgnored: boolean): Promise<AuditResult[]> {
		const settings = this.settings();
		const { kind } = settings.audit;
		const key = JSON.stringify([kind, auditExclusions(this.app, settings, includeIgnored)]);
		if (this.cached?.key === key) return this.cached.results;
		const results = auditVault(this.app, kind, settings, includeIgnored).then((report) =>
			toAuditResults(report, (path) => this.app.vault.getFileByPath(path) ?? undefined),
		);
		const cached = { key, kind, results };
		this.cached = cached;
		// Why: 失敗した監査を再び返してはいけない。次の検索が改めて試みる。
		results.catch(() => {
			if (this.cached === cached) this.cached = undefined;
		});
		return results;
	}
}

/** 報告からパレットの行を作る。スナップショットのあとに消えたファイルは捨てる。 */
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
				return [
					{
						id: `audit:${kind}:${path}`,
						mode: "audit",
						kind,
						primary: file.name,
						secondary: `${path} · ${formatSize(size)}`,
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
				secondary: `${countLabel(new Set(sources.map(({ path }) => path)).size, "ノート")} · ${sources[0].path}`,
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
						? `${path} · ${t("audit.provider.foldersInside", { count: foldersInside })}`
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
