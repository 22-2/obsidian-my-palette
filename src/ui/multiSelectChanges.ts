/** 変更のルールから見た1行。その同一性、値、対象がすでに持っているかどうか。 */
export interface ChangeRow<V> {
	key: string;
	value: V;
	/** すでにすべての対象に適用されている。このような行は最初からチェックされている。 */
	applied?: boolean;
}

/** 複数選択のセレクターがホストに求める操作。適用する値と、適用済みで削除する値。 */
export interface MultiSelectChanges<V> {
	add: V[];
	remove: V[];
}

/**
 * 行がチェックされているかどうか。適用済みの行は最初からチェックされ、未適用の行は
 * 最初はチェックされていない。切り替えた行は、最初の状態の反対になる。
 */
export function isCheckedRow<V>(row: ChangeRow<V>, toggledKeys: ReadonlySet<string>): boolean {
	return Boolean(row.applied) !== toggledKeys.has(row.key);
}

/**
 * ユーザーがチェックで固定した行の変更。未適用の行は追加し、適用済みの行は、
 * チェックを外したときだけ削除する。ただ強調表示されているだけの適用済みの行は、そのままにする。
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
 * ユーザーが直接操作する行の変更(Enter、ダブルクリック)。未適用の行はすべて追加し、
 * 適用済みの行はすべて削除する。
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
