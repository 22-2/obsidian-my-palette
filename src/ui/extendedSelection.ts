export interface SelectionModifiers {
	toggle: boolean;
	range: boolean;
}

/**
 * DOM のイベント処理とは独立に、エクスプローラー風の一覧の選択を表す。
 * 検索で描き直すたびに結果はリセットされるので、インデックスに基づく状態が、一括操作の前に
 * ユーザーにもう見えないファイルを残すことはない。
 */
export class ExtendedSelection {
	private selectedIndexes = new Set<number>();
	private anchorIndex = -1;

	reset(size: number): void {
		this.selectedIndexes = size > 0 ? new Set([0]) : new Set();
		this.anchorIndex = size > 0 ? 0 : -1;
	}

	/** 行が動いた描き直しの後に、選択を戻す。アンカーはカーソルの行に保つ。 */
	restore(indexes: readonly number[], anchor: number, size: number): void {
		const valid = indexes.filter((index) => this.isValidIndex(index, size));
		if (valid.length === 0) return;
		this.selectedIndexes = new Set(valid);
		this.anchorIndex = this.isValidIndex(anchor, size) ? anchor : valid[0];
	}

	select(index: number, size: number, modifiers: SelectionModifiers): void {
		if (!this.isValidIndex(index, size)) return;
		if (modifiers.range && this.anchorIndex >= 0) {
			const range = this.rangeBetween(this.anchorIndex, index);
			this.selectedIndexes = modifiers.toggle
				? new Set([...this.selectedIndexes, ...range])
				: new Set(range);
			return;
		}
		if (modifiers.toggle) {
			if (this.selectedIndexes.has(index)) this.selectedIndexes.delete(index);
			else this.selectedIndexes.add(index);
			this.anchorIndex = index;
			return;
		}
		this.selectedIndexes = new Set([index]);
		this.anchorIndex = index;
	}

	selectForContextMenu(index: number, size: number): void {
		if (!this.isValidIndex(index, size) || this.selectedIndexes.has(index)) return;
		// Why: エクスプローラーは、複数選択を右クリックしても選択を保つ。一方で、その選択の外を
		// 右クリックすると、1項目の新しい操作の対象になるため。
		this.selectedIndexes = new Set([index]);
		this.anchorIndex = index;
	}

	has(index: number): boolean {
		return this.selectedIndexes.has(index);
	}

	indexes(): number[] {
		return [...this.selectedIndexes].sort((left, right) => left - right);
	}

	private rangeBetween(start: number, end: number): number[] {
		const first = Math.min(start, end);
		const last = Math.max(start, end);
		return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
	}

	private isValidIndex(index: number, size: number): boolean {
		return Number.isInteger(index) && index >= 0 && index < size;
	}
}
