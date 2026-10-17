/**
 * 項目を、元のリストの隙間へ移す。挿入の番号は、先頭の項目の前から最後の項目の後までの隙間を表す。
 * ドラッグ中の挿入位置の表示と一致させる。
 */
export function moveByInsertionIndex<T>(
	items: readonly T[],
	sourceIndex: number,
	insertionIndex: number,
): readonly T[] {
	if (sourceIndex < 0 || sourceIndex >= items.length) return items;
	const boundedInsertionIndex = Math.max(0, Math.min(insertionIndex, items.length));
	// ドラッグした項目の直前と直後の隙間は、どちらも位置を変えない。両方を認識して、
	// 不要な保存と描き直しを避ける。
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
