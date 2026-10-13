/** How a typed value is normalized and checked before it may be offered as new. */
export interface NewValueRules {
	/** Removes what users type out of habit, such as a leading `#` for tags. */
	normalize(query: string): string;
	/** Whether the normalized text can form one value at all. */
	isValid(value: string): boolean;
	/** Identity used to compare with known values, such as case-insensitive for tags. */
	keyOf(value: string): string;
}

/**
 * The value the typed input would add as new, or undefined when the input is empty,
 * cannot form a value, or already matches a known one.
 */
export function typedNewValue(
	query: string,
	knownValues: readonly string[],
	rules: NewValueRules,
): string | undefined {
	const value = rules.normalize(query);
	if (!value || !rules.isValid(value)) return undefined;
	const known = new Set(knownValues.map((known) => rules.keyOf(known)));
	return known.has(rules.keyOf(value)) ? undefined : value;
}
