/**
 * Keep filter matching independent from Obsidian so path rules can be tested
 * in the Node-based unit-test environment without loading the desktop package.
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
 * Compiles the filters once, for callers that test many paths against the same filters.
 * An invalid regular expression matches nothing.
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
