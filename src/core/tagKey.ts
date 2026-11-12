/** タグは先頭の # と大文字・小文字を区別せずに比較する。 */
export function tagKey(tag: string): string {
	return tag.replace(/^#/, "").toLowerCase();
}
