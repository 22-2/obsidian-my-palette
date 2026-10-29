import { t } from "src/i18n";

const MOC_HEADER = "## MOC";
const RELATEDS_ITEM = "- Relateds";

type Located = { relatedsIndex: number } | { message: string };

/**
 * `## MOC` の見出しの位置を、末尾から探す。
 * Why: テンプレートは MOC の節をノートの末尾に置く。そのため、ほかのノートから引用や貼り付けされた
 * 先頭寄りの `## MOC` を、ノート自身のものと取り違えてはいけない。
 */
function findMocHeaderIndex(lines: readonly string[]): number {
	return lines.findLastIndex((line) => line.trim().startsWith(MOC_HEADER));
}

/** MOC の節の中にある Relateds の項目を探す。 */
function locateRelateds(lines: readonly string[]): Located {
	const mocHeaderIndex = findMocHeaderIndex(lines);
	if (mocHeaderIndex === -1)
		return { message: t("moc.core.headerNotFound", { header: MOC_HEADER }) };
	for (let index = mocHeaderIndex + 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed.startsWith("##")) break;
		if (trimmed.startsWith(RELATEDS_ITEM)) return { relatedsIndex: index };
	}
	return { message: t("moc.core.noRelatedsItem", { header: MOC_HEADER, item: RELATEDS_ITEM }) };
}

/** Relateds の下にネストされた最後の行の次の行番号。 */
function relatedsChildrenEnd(lines: readonly string[], relatedsIndex: number): number {
	const relatedsIndent = lines[relatedsIndex].match(/^\s*/)?.[0].length ?? 0;
	let end = relatedsIndex + 1;
	for (; end < lines.length; end += 1) {
		const line = lines[end];
		if (line.trim().startsWith("##")) break;
		if (line.trim() === "") continue;
		if ((line.match(/^\s*/)?.[0].length ?? 0) <= relatedsIndent) break;
	}
	return end;
}

/**
 * Relateds の項目の下にネストされた行の、0始まりの行範囲 `[start, end)`。
 * MOC の Relateds 項目がないノートでは undefined を返す。本文中の別のリンクと、
 * Relateds のリンクを区別するために使う。
 */
export function relatedsLineRange(content: string): [number, number] | undefined {
	const lines = content.split("\n");
	const located = locateRelateds(lines);
	if (!("relatedsIndex" in located)) return undefined;
	return [located.relatedsIndex + 1, relatedsChildrenEnd(lines, located.relatedsIndex)];
}

export type AddLinkResult =
	| { success: true; newContent: string }
	| { success: false; message: string };

/** MOC の Relateds 項目の直下の子として、ウィキリンクを追加する。 */
export function addLinkToMocRelateds(
	content: string,
	linkBasename: string,
	tabSize: number,
): AddLinkResult {
	const lines = content.split("\n");
	const located = locateRelateds(lines);
	if (!("relatedsIndex" in located)) return { success: false, message: located.message };
	const { relatedsIndex } = located;

	const wikiLink = `[[${linkBasename}]]`;
	const relatedsIndent = lines[relatedsIndex].match(/^\s*/)?.[0] ?? "";
	const insertIndex = relatedsChildrenEnd(lines, relatedsIndex);
	// 従来どおり、子項目の直後の行も重複確認に含める。
	if (lines.slice(relatedsIndex + 1, insertIndex + 1).some((line) => line.includes(wikiLink)))
		return { success: false, message: t("moc.core.alreadyExists") };

	const directChildIndent = lines
		.slice(relatedsIndex + 1, insertIndex)
		.filter((line) => line.trim() !== "")
		.map((line) => line.match(/^\s*/)?.[0] ?? "")
		.filter((indent) => indent.length > relatedsIndent.length)
		.sort((a, b) => a.length - b.length)[0];
	const childIndent = directChildIndent ?? relatedsIndent + " ".repeat(Math.max(0, tabSize));

	lines.splice(insertIndex, 0, `${childIndent}- ${wikiLink}`);
	return { success: true, newContent: lines.join("\n") };
}

export type RemoveLinkResult =
	| { success: true; newContent: string }
	| { success: false; message: string };

/** MOC の Relateds 項目の直下の子のうち、ノートへリンクしている項目を削除する。 */
export function removeLinkFromMocRelateds(content: string, linkBasename: string): RemoveLinkResult {
	const lines = content.split("\n");
	const located = locateRelateds(lines);
	if (!("relatedsIndex" in located)) return { success: false, message: located.message };
	const { relatedsIndex } = located;

	const end = relatedsChildrenEnd(lines, relatedsIndex);
	const wikiLink = new RegExp(`\\[\\[${escapeRegExp(linkBasename)}(\\|[^\\]]*)?\\]\\]`);
	for (let index = relatedsIndex + 1; index < end; index += 1) {
		const line = lines[index];
		const indent = line.match(/^\s*/)?.[0].length ?? 0;
		if (!/^\s*[-*+]\s+/.test(line) || !wikiLink.test(line)) continue;
		// Why: 親の行を削除すると、その下にネストされたノートが黙って消えるか、付け替わってしまうため。
		const next = lines[index + 1];
		if (next?.trim() && (next.match(/^\s*/)?.[0].length ?? 0) > indent)
			return { success: false, message: t("moc.core.nestedItems") };
		lines.splice(index, 1);
		return { success: true, newContent: lines.join("\n") };
	}
	return { success: false, message: t("moc.core.notFound") };
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Vault 監査用: テンプレートから作ったノートは、MOC の節だけを持つことが多い。その節は
 * ほかのノートへのリンクを持つが、ノート自身の内容は何も語らない。MOC の節は `## MOC` から
 * 次の見出しまでで、その外にはフロントマターと空行しかあってはならない。
 */
export function isMocOnly(content: string): boolean {
	const lines = withoutFrontmatter(content).split(/\r?\n/);
	const mocIndex = findMocHeaderIndex(lines);
	if (mocIndex === -1) return false;
	const nextHeading = lines.findIndex(
		(line, index) => index > mocIndex && /^#{1,6}\s/.test(line.trim()),
	);
	const end = nextHeading === -1 ? lines.length : nextHeading;
	return [...lines.slice(0, mocIndex), ...lines.slice(end)].every((line) => line.trim() === "");
}

function withoutFrontmatter(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(content);
	return match ? content.slice(match[0].length) : content;
}
