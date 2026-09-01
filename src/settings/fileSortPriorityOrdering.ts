/**
 * Move an item to a gap in the original list. Insertion indexes describe the
 * gaps before item 0 through after the final item, matching the DnD indicator.
 */
export function moveByInsertionIndex<T>(
	items: readonly T[],
	sourceIndex: number,
	insertionIndex: number,
): readonly T[] {
	if (sourceIndex < 0 || sourceIndex >= items.length) return items;
	const boundedInsertionIndex = Math.max(0, Math.min(insertionIndex, items.length));
	// The gaps immediately before and after the dragged item both preserve its
	// position; recognizing both avoids a needless save and visual rerender.
	if (boundedInsertionIndex === sourceIndex || boundedInsertionIndex === sourceIndex + 1)
		return items;

	const next = [...items];
	const [moved] = next.splice(sourceIndex, 1);
	if (moved === undefined) return items;
	next.splice(
		boundedInsertionIndex > sourceIndex ? boundedInsertionIndex - 1 : boundedInsertionIndex,
		0,
		moved,
	);
	return next;
}
