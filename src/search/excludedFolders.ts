import { isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPaths";

// プラグイン共通の除外フォルダ参照。全プロバイダで共有し、取得は検索時に行うことで
// 設定変更を再起動なしで反映する。
export type ExcludedFolderSource = () => readonly string[];

export const EMPTY_EXCLUDED_FOLDER_SOURCE: ExcludedFolderSource = () => [];

export function isExcludedFolder(source: ExcludedFolderSource, vaultPath: string): boolean {
	return isUserIgnoredPathWithFilters(source(), vaultPath);
}

export function filterExcludedFolders<T>(
	source: ExcludedFolderSource,
	items: readonly T[],
	getVaultPath: (item: T) => string | undefined,
): T[] {
	return items.filter((item) => {
		const path = getVaultPath(item);
		return path === undefined || !isExcludedFolder(source, path);
	});
}
