const MOC_HEADER = "## MOC";
const RELATEDS_ITEM = "- Relateds";

type Located = { relatedsIndex: number } | { message: string };

/** Finds the Relateds item inside the MOC section. */
function locateRelateds(lines: readonly string[]): Located {
	const mocHeaderIndex = lines.findIndex((line) => line.trim().startsWith(MOC_HEADER));
	if (mocHeaderIndex === -1) return { message: `"${MOC_HEADER}" header not found.` };
	for (let index = mocHeaderIndex + 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed.startsWith("##")) break;
		if (trimmed.startsWith(RELATEDS_ITEM)) return { relatedsIndex: index };
	}
	return { message: `"${MOC_HEADER}" section does not contain "${RELATEDS_ITEM}".` };
}

/** Line index after the last line nested under the Relateds item. */
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
 * Zero-based line range `[start, end)` of the items nested under Relateds, or
 * undefined when the note has no MOC Relateds item. Used to tell a Relateds link
 * from any other link in the body.
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

/** Adds a wiki link as a direct child of the MOC Relateds item. */
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
	let insertIndex = relatedsIndex + 1;
	for (; insertIndex < lines.length; insertIndex += 1) {
		const line = lines[insertIndex];
		if (line.includes(wikiLink)) return { success: false, message: "Link already exists." };
		if (line.trim().startsWith("##")) break;
		if (line.trim() === "") continue;
		const indent = line.match(/^\s*/)?.[0].length ?? 0;
		if (indent <= relatedsIndent.length) break;
	}

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

/** Removes the direct child item linking to a note from the MOC Relateds item. */
export function removeLinkFromMocRelateds(content: string, linkBasename: string): RemoveLinkResult {
	const lines = content.split("\n");
	const located = locateRelateds(lines);
	if (!("relatedsIndex" in located)) return { success: false, message: located.message };
	const { relatedsIndex } = located;

	const relatedsIndent = lines[relatedsIndex].match(/^\s*/)?.[0].length ?? 0;
	const wikiLink = new RegExp(`\\[\\[${escapeRegExp(linkBasename)}(\\|[^\\]]*)?\\]\\]`);
	for (let index = relatedsIndex + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim().startsWith("##")) break;
		if (line.trim() === "") continue;
		const indent = line.match(/^\s*/)?.[0].length ?? 0;
		if (indent <= relatedsIndent) break;
		if (!/^\s*[-*+]\s+/.test(line) || !wikiLink.test(line)) continue;
		// Why: deleting a parent line would silently drop or re-parent its nested notes.
		const next = lines[index + 1];
		if (next?.trim() && (next.match(/^\s*/)?.[0].length ?? 0) > indent)
			return { success: false, message: "The link has nested items; remove it manually." };
		lines.splice(index, 1);
		return { success: true, newContent: lines.join("\n") };
	}
	return { success: false, message: "Link not found." };
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MocOnlyInfo {
	/** Nothing but frontmatter, blank lines and the MOC section is in the note. */
	mocOnly: boolean;
	/** Entries with text under the MOC's References item. */
	references: number;
}

/**
 * For Vault audit: a note made from a template often holds only its MOC section, which
 * links it to other notes but says nothing itself. The MOC section runs from `## MOC` to
 * the next heading.
 */
export function analyzeMocOnly(content: string): MocOnlyInfo {
	const lines = withoutFrontmatter(content).split(/\r?\n/);
	const mocIndex = lines.findIndex((line) => line.trim().startsWith(MOC_HEADER));
	if (mocIndex === -1) return { mocOnly: false, references: 0 };
	const nextHeading = lines.findIndex(
		(line, index) => index > mocIndex && /^#{1,6}\s/.test(line.trim()),
	);
	const end = nextHeading === -1 ? lines.length : nextHeading;
	const outside = [...lines.slice(0, mocIndex), ...lines.slice(end)];
	return {
		mocOnly: outside.every((line) => line.trim() === ""),
		references: countReferences(lines.slice(mocIndex + 1, end)),
	};
}

function countReferences(section: readonly string[]): number {
	const referencesIndex = section.findIndex((line) => line.trim().startsWith("- References"));
	if (referencesIndex === -1) return 0;
	const indent = (line: string) => line.match(/^\s*/)?.[0].length ?? 0;
	const parentIndent = indent(section[referencesIndex]);
	let count = 0;
	for (const line of section.slice(referencesIndex + 1)) {
		if (line.trim() === "") continue;
		if (indent(line) <= parentIndent) break;
		// Why: a template leaves an empty `- ` under References; only entries with text count.
		if (/^\s*[-*+]\s+\S/.test(line)) count += 1;
	}
	return count;
}

function withoutFrontmatter(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(content);
	return match ? content.slice(match[0].length) : content;
}
