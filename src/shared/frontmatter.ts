/**
 * Normalize the only frontmatter value currently used by file ordering.
 * Invalid values are treated as absent so a malformed property cannot produce
 * NaN comparisons or move an otherwise ordinary note unpredictably.
 */
export function normalizeFrontmatterPrior(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
