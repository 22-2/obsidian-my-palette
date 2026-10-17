import { TFile, type App } from "obsidian";

/**
 * リンク元とリンク先の保管庫内のパスを集める。MOC 挿入の
 * バッジと関連タグのランキングの両方で同じ「関連ノート」の定義を使うために共有する。
 * 発リンクは本文のリンクだけを数える。埋め込みとフロントマターのリンクは
 * 意図的に数えない。
 */
export function relationPaths(
	app: App,
	file: TFile,
): {
	outgoing: Set<string>;
	incoming: Set<string>;
} {
	const outgoing = new Set<string>();
	for (const link of app.metadataCache.getFileCache(file)?.links ?? []) {
		const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (target instanceof TFile) outgoing.add(target.path);
	}

	const incoming = new Set<string>();
	for (const path of app.metadataCache.getBacklinksForFile(file)?.data?.keys() ?? []) {
		incoming.add(path);
	}
	return { outgoing, incoming };
}
