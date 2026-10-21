import { tagKey } from "src/tags/tagChoices";

// Why: Obsidian がタグとして認める文字。空白と記号は含めず、`/` だけで階層を表す。
const TAG_NAME = /^[^\s\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\]+$/;

/** 入力を `#` を除いたタグ名にする。Obsidian のタグとして使えない名前は undefined を返す。 */
export function normalizeTagName(input: string): string | undefined {
	const name = input.trim().replace(/^#+/, "");
	// Why: 数字だけのタグは Obsidian がタグとして認識しない。
	if (!TAG_NAME.test(name) || /^\d+$/.test(name)) return undefined;
	return name;
}

/** タグ名が `from` 本体か、その子階層（`from/...`）かどうか。大文字・小文字は区別しない。 */
export function isTagOrChild(name: string, from: string): boolean {
	const key = tagKey(name);
	const fromKey = tagKey(from);
	return key === fromKey || key.startsWith(fromKey + "/");
}

/**
 * タグ名 `name` を、`from` 以下の階層もまとめて `to` に変える。
 * 大文字・小文字は区別しない。`from/child` は `to/child` になる。
 */
export function renameTagName(name: string, from: string, to: string): string {
	if (!isTagOrChild(name, from)) return name;
	return tagKey(name) === tagKey(from) ? to : to + name.slice(from.length);
}

/** 文字列の `tags` と配列の `tags` を、フロントマターの値として読む。読めない値は undefined。 */
function readTagList(value: unknown): string[] | undefined {
	if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
	return undefined;
}

export interface RenamedList {
	values: unknown[];
	changed: boolean;
}

/**
 * フロントマターの `tags` を書き換える。置換で同じタグが二つになったら、先に出た方だけ残す。
 * 元から重複していた値には触らない。読めない値は changed が false になる。
 */
export function renameFrontmatterTags(value: unknown, from: string, to: string): RenamedList {
	const list = readTagList(value);
	if (!list) return { values: [], changed: false };

	const seen = new Map<string, boolean>();
	const values: string[] = [];
	let changed = false;
	for (const item of list) {
		const hashed = item.startsWith("#");
		const name = hashed ? item.slice(1) : item;
		const renamed = renameTagName(name, from, to);
		const next = hashed ? `#${renamed}` : renamed;
		const itemChanged = renamed !== name;
		const key = tagKey(next);
		const kept = seen.get(key);
		if (kept !== undefined && (kept || itemChanged)) {
			changed = true;
			continue;
		}
		if (itemChanged) changed = true;
		seen.set(key, itemChanged);
		values.push(next);
	}
	return { values, changed };
}

/** フロントマターの `aliases` のうち、`#` で始まるタグのエイリアスだけを書き換える。 */
export function renameAliasTags(values: unknown[], from: string, to: string): RenamedList {
	let changed = false;
	const next = values.map((value) => {
		if (typeof value !== "string" || !value.startsWith("#")) return value;
		const renamed = "#" + renameTagName(value.slice(1), from, to);
		if (renamed !== value) changed = true;
		return renamed;
	});
	return { values: next, changed };
}

export interface InlineTagPosition {
	/** 本文に書かれたままのタグ（`#` 付き）。 */
	tag: string;
	start: number;
	end: number;
}

/**
 * 本文の `#タグ` の位置を、タグごと書き換える。位置は後ろから書き換えるので、前の位置はずれない。
 * 位置の文字列が本文と一致しなければ、読んだ後に編集されたとみなして undefined を返す。
 */
export function renameInlineTags(
	text: string,
	positions: readonly InlineTagPosition[],
	from: string,
	to: string,
): { text: string; count: number } | undefined {
	for (const { tag, start, end } of positions) {
		if (text.slice(start, end) !== tag) return undefined;
	}
	let result = text;
	let count = 0;
	const sorted = [...positions].sort((a, b) => b.start - a.start);
	for (const { tag, start, end } of sorted) {
		const renamed = "#" + renameTagName(tag.slice(1), from, to);
		if (renamed === tag) continue;
		result = result.slice(0, start) + renamed + result.slice(end);
		count++;
	}
	return { text: result, count };
}
