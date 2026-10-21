import { mergeFrontmatterTags, normalizeFrontmatterTags } from "src/shared/frontmatter";

/**
 * ノートの統合で使う、テキストとプロパティの変換。Obsidian に依存しないので、そのままテストできる。
 */

export type LinkResolver = (linkpath: string, fromPath: string) => string | null;

export type Frontmatter = Record<string, unknown>;

export interface MergeSourceProperties {
	basename: string;
	frontmatter: Frontmatter;
}

export interface MergePropertyOptions {
	/** 統合元の名前を、マージ先の `aliases` に加えるかどうか。 */
	aliasSourceNames: boolean;
}

export interface MergePart {
	path: string;
	body: string;
}

export interface RetargetResult {
	content: string;
	/** 付け替えたリンクの数。0 のときは content を変えない。 */
	count: number;
}

// Why: Obsidian の既定の作りでフロントマターは先頭だけにある。改行の型は問わない。
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
/** `[[リンク#見出し|別名]]` と `![[...]]`。リンク先は `]`・`|`・`#` と改行を含まない。 */
const WIKILINK = /(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(\|[^\]\n]*)?\]\]/g;
/** リンクだけからなる箇条書きの行。例: `\t- [[test]]`（MOC の Relateds など）。 */
const BARE_LINK_ITEM = /^\s*[-*+]\s+!?\[\[[^\]\n]*\]\]\s*$/;
/** Obsidian がキャッシュに入れる内部のキー。マージ先には書かない。 */
const INTERNAL_KEYS = new Set(["position"]);

/** 先頭のフロントマターを、そのまま残す部分と本文に分ける。フロントマターがなければ前の部分は空。 */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
	const match = FRONTMATTER.exec(content);
	if (!match) return { frontmatter: "", body: content };
	return { frontmatter: match[0], body: content.slice(match[0].length) };
}

function linksTo(
	line: string,
	fromPath: string,
	paths: ReadonlySet<string>,
	resolve: LinkResolver,
) {
	for (const match of line.matchAll(WIKILINK)) {
		const path = resolve(match[2] ?? "", fromPath);
		if (path && paths.has(path)) return true;
	}
	return false;
}

/**
 * `moved` のノートへのリンクを `target` へのリンクに付け替える。見出し・別名・埋め込みは残す。
 * 付け替えが起きたファイルでは、同じ先を指すリンクだけの箇条書き（MOC の Relateds など）が
 * 重なるので、2つ目以降を消す。
 */
export function retargetLinks(
	content: string,
	fromPath: string,
	target: { path: string; basename: string },
	moved: ReadonlySet<string>,
	resolve: LinkResolver,
): RetargetResult {
	let count = 0;
	const lines = content.split("\n").map((line) =>
		line.replace(
			WIKILINK,
			(match: string, embed: string, linkpath: string, heading?: string, alias?: string) => {
				const path = resolve(linkpath, fromPath);
				if (!path || !moved.has(path)) return match;
				count++;
				// Why: パスで書かれたリンクは、パスのまま付け替える。名前だけのリンクは名前で書く。
				const name = linkpath.includes("/")
					? target.path.replace(/\.md$/, "")
					: target.basename;
				return `${embed}[[${name}${heading ?? ""}${alias ?? ""}]]`;
			},
		),
	);
	if (count === 0) return { content, count };
	const targetPaths = new Set([target.path]);
	const seen = new Set<string>();
	const kept = lines.filter((line) => {
		if (!BARE_LINK_ITEM.test(line) || !linksTo(line, fromPath, targetPaths, resolve))
			return true;
		const key = line.trim();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return { content: kept.join("\n"), count };
}

/**
 * 統合するノート同士のリンクは、まとめた本文の中では自分自身を指すので取り除く。リンクだけの箇条書きは
 * 行ごと消し、文中のリンクは表示名の文字だけを残す。
 */
function unlinkGroup(
	body: string,
	fromPath: string,
	group: ReadonlySet<string>,
	resolve: LinkResolver,
): string {
	return body
		.split("\n")
		.flatMap((line) => {
			if (BARE_LINK_ITEM.test(line) && linksTo(line, fromPath, group, resolve)) return [];
			const text = line.replace(
				WIKILINK,
				(
					match: string,
					_embed: string,
					linkpath: string,
					_heading?: string,
					alias?: string,
				) => {
					const path = resolve(linkpath, fromPath);
					if (!path || !group.has(path)) return match;
					return alias ? alias.slice(1) : (linkpath.split("/").pop() ?? linkpath);
				},
			);
			return [text];
		})
		.join("\n");
}

/**
 * 統合するノートの本文を、`%パス%` の区切りで縦に並べる。マージ先の本文を一番上に置き、統合元を続ける。
 * 並べ方の微調整は、統合のあとにユーザーが行う。
 */
export function buildMergedBody(
	sources: readonly MergePart[],
	target: MergePart,
	group: ReadonlySet<string>,
	resolve: LinkResolver,
): string {
	const blocks = [target, ...sources].map((part) => {
		const body = unlinkGroup(part.body.trim(), part.path, group, resolve).trim();
		return `%${part.path}%\n\n${body}`;
	});
	return `${blocks.join("\n\n")}\n`;
}

function listOf(value: unknown): unknown[] {
	if (value === undefined || value === null || value === "") return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * マージ先のプロパティに統合元のプロパティを足す。マージ先にあるキーの値は残し、値が違うキーは
 * 衝突として返す。`tags` は和集合にする。`aliases` は和集合にし、`aliasSourceNames` が真なら統合元の
 * 名前も加えて、統合元へのリンクを外部からも解決できるようにする。
 */
export function mergeFrontmatter(
	target: Frontmatter,
	targetBasename: string,
	sources: readonly MergeSourceProperties[],
	options: MergePropertyOptions,
): string[] {
	const conflicts = new Set<string>();
	for (const source of sources) {
		for (const [key, value] of Object.entries(source.frontmatter)) {
			if (INTERNAL_KEYS.has(key) || key === "aliases") continue;
			if (key === "tags") {
				const tags = normalizeFrontmatterTags(value);
				if (tags.length > 0) target.tags = mergeFrontmatterTags(target.tags, tags);
				continue;
			}
			if (!(key in target)) target[key] = value;
			else if (JSON.stringify(target[key]) !== JSON.stringify(value)) conflicts.add(key);
		}
	}
	const aliases: unknown[] = [];
	const seen = new Set<string>([targetBasename.toLowerCase()]);
	const add = (alias: unknown) => {
		if (typeof alias !== "string" || alias === "") return;
		const key = alias.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		aliases.push(alias);
	};
	listOf(target.aliases).forEach(add);
	for (const source of sources) {
		listOf(source.frontmatter.aliases).forEach(add);
		if (options.aliasSourceNames) add(source.basename);
	}
	if (aliases.length > 0) target.aliases = aliases;
	return [...conflicts].sort();
}
