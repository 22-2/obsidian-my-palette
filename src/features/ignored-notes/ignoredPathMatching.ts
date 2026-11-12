/**
 * パスの一致判定を Obsidian から独立させる。これにより、デスクトップ版のパッケージを読み込まずに、
 * Node ベースのユニットテスト環境でパスのルールをテストできる。
 */

function normalizePath(value: string): string {
	return value.replace(/\\/g, "/");
}

export function isUserIgnoreFilterRegex(filter: string): boolean {
	return filter.length >= 2 && filter.startsWith("/") && filter.endsWith("/");
}

export function isUserIgnoredPathWithFilters(
	filters: readonly string[],
	vaultPath: string,
): boolean {
	return createUserIgnoredPathMatcher(filters)(vaultPath);
}

/**
 * フィルターを一度だけコンパイルする。同じフィルターで多くのパスを判定する呼び出し元向け。
 * 不正な正規表現は何にも一致しない。
 */
export function createUserIgnoredPathMatcher(
	filters: readonly string[],
): (vaultPath: string) => boolean {
	const matchers = filters.flatMap((ignored): ((path: string) => boolean)[] => {
		if (!isUserIgnoreFilterRegex(ignored))
			return [(path) => path === ignored || path.startsWith(`${ignored}/`)];
		try {
			const pattern = new RegExp(ignored.slice(1, -1));
			return [(path) => pattern.test(path)];
		} catch {
			return [];
		}
	});
	if (matchers.length === 0) return () => false;
	return (vaultPath) => {
		const normalizedPath = normalizePath(vaultPath);
		return matchers.some((matches) => matches(normalizedPath));
	};
}
