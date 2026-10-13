/** The strings in a list-type property; a single string counts as a one-item list. */
export function readList(value: unknown): string[] {
	if (typeof value === "string") return value ? [value] : [];
	if (!Array.isArray(value)) return [];
	return value.flatMap((item: unknown) =>
		typeof item === "string" || typeof item === "number" ? [String(item)] : [],
	);
}
