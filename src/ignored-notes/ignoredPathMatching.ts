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
	const normalizedPath = normalizePath(vaultPath);
	return filters.some((ignored) => {
		if (isUserIgnoreFilterRegex(ignored)) {
			try {
				return new RegExp(ignored.slice(1, -1)).test(normalizedPath);
			} catch {
				return false;
			}
		}
		return normalizedPath === ignored || normalizedPath.startsWith(`${ignored}/`);
	});
}
