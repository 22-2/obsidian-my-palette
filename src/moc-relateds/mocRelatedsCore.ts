const MOC_HEADER = "## MOC";
const RELATEDS_ITEM = "- Relateds";

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
	const mocHeaderIndex = lines.findIndex((line) => line.trim().startsWith(MOC_HEADER));
	if (mocHeaderIndex === -1) {
		return { success: false, message: `"${MOC_HEADER}" header not found.` };
	}

	let relatedsIndex = -1;
	for (let index = mocHeaderIndex + 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed.startsWith("##")) break;
		if (trimmed.startsWith(RELATEDS_ITEM)) {
			relatedsIndex = index;
			break;
		}
	}
	if (relatedsIndex === -1) {
		return {
			success: false,
			message: `"${MOC_HEADER}" section does not contain "${RELATEDS_ITEM}".`,
		};
	}

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
