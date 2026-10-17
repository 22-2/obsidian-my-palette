/** 「ノート 3 件」のように、名詞と件数を日本語の形で並べる。 */
export function countLabel(count: number, noun: string): string {
	return `${noun} ${count} 件`;
}
