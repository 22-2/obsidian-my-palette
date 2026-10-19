const HIRAGANA_PATTERN = /[ぁ-ゖ]/g;
const HIRAGANA_TO_KATAKANA_OFFSET = 0x60;

/**
 * ひらがなをカタカナに揃え、「ながの」と「ナガノ」を同じ文字列として比べられるようにする。
 * 1文字ずつ同じ長さの文字に置き換えるので、あいまい一致が返す文字の位置はずれない。
 */
export function foldKana(value: string): string {
	return value.replace(HIRAGANA_PATTERN, (char) =>
		String.fromCharCode(char.charCodeAt(0) + HIRAGANA_TO_KATAKANA_OFFSET),
	);
}
