export interface SelectionModifiers {
	toggle: boolean;
	range: boolean;
}

/**
 * Models Explorer-style list selection independently from DOM event handling.
 * Results are reset whenever a search rerenders, so index-based state cannot
 * retain hidden files that the user can no longer see before a batch action.
 */
export class ExtendedSelection {
	private selectedIndexes = new Set<number>();
	private anchorIndex = -1;

	reset(size: number): void {
		this.selectedIndexes = size > 0 ? new Set([0]) : new Set();
		this.anchorIndex = size > 0 ? 0 : -1;
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
		// Why: Explorer preserves a multi-selection when it is right-clicked, but
		// right-clicking outside that selection starts a new one-item context.
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
