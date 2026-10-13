/** A row as the change rules see it: its identity, value, and whether the targets already have it. */
export interface ChangeRow<V> {
	key: string;
	value: V;
	/** Applied to every target already; a row like this is checked from the start. */
	applied?: boolean;
}

/** What a multi selector asks the host to do: values to apply and applied values to remove. */
export interface MultiSelectChanges<V> {
	add: V[];
	remove: V[];
}

/**
 * Whether a row is checked. An applied row starts checked and an unapplied row
 * starts unchecked; a toggled row has the opposite of its starting state.
 */
export function isCheckedRow<V>(row: ChangeRow<V>, toggledKeys: ReadonlySet<string>): boolean {
	return Boolean(row.applied) !== toggledKeys.has(row.key);
}

/**
 * Changes for rows the user has pinned with checks: an unapplied row is added, and
 * an applied row is removed only when its check was cleared. Applied rows that are
 * merely highlighted are left alone.
 */
export function pendingChanges<V>(
	rows: readonly ChangeRow<V>[],
	toggledKeys: ReadonlySet<string>,
): MultiSelectChanges<V> {
	return {
		add: rows.filter((row) => !row.applied).map(({ value }) => value),
		remove: rows
			.filter((row) => row.applied && toggledKeys.has(row.key))
			.map(({ value }) => value),
	};
}

/**
 * Changes for rows the user acts on directly (Enter, double-click): every unapplied
 * row is added and every applied row is removed.
 */
export function directChanges<V>(rows: readonly ChangeRow<V>[]): MultiSelectChanges<V> {
	return {
		add: rows.filter((row) => !row.applied).map(({ value }) => value),
		remove: rows.filter((row) => row.applied).map(({ value }) => value),
	};
}

export function changeCount<V>(changes: MultiSelectChanges<V>): number {
	return changes.add.length + changes.remove.length;
}
