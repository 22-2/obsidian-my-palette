import { describe, expect, it } from "vitest";
import {
	addLinkToMocRelateds,
	isMocOnly,
	relatedsLineRange,
	removeLinkFromMocRelateds,
} from "src/moc-relateds/mocRelatedsCore";

describe("addLinkToMocRelateds", () => {
	it("adds a link using the existing Relateds child indentation", () => {
		const content = ["## MOC", "- Relateds", "    - [[Existing note]]", "- References"].join(
			"\n",
		);

		expect(addLinkToMocRelateds(content, "New note", 2)).toEqual({
			success: true,
			newContent: [
				"## MOC",
				"- Relateds",
				"    - [[Existing note]]",
				"    - [[New note]]",
				"- References",
			].join("\n"),
		});
	});

	it("adds to the last MOC section when the note has more than one", () => {
		const content = [
			"## MOC",
			"- Relateds",
			"    - [[Quoted]]",
			"## Body",
			"## MOC",
			"- Relateds",
			"    - [[Own]]",
		].join("\n");

		const result = addLinkToMocRelateds(content, "New note", 4);
		expect(result).toEqual({
			success: true,
			newContent: `${content}\n    - [[New note]]`,
		});
	});

	it("does not add the same link twice", () => {
		const content = "## MOC\n- Relateds\n    - [[Existing note]]";
		expect(addLinkToMocRelateds(content, "Existing note", 4)).toEqual({
			success: false,
			message: "リンクはすでにあります。",
		});
	});
});

describe("removeLinkFromMocRelateds", () => {
	const moc = [
		"## MOC",
		"- Relateds",
		"    - [[A]]",
		"    - [[B|alias]]",
		"- References",
		"    - [[A]]",
	];

	it("removes only the matching Relateds child, including aliased links", () => {
		expect(removeLinkFromMocRelateds(moc.join("\n"), "B")).toEqual({
			success: true,
			newContent: ["## MOC", "- Relateds", "    - [[A]]", "- References", "    - [[A]]"].join(
				"\n",
			),
		});
	});

	it("ignores links outside the Relateds item", () => {
		expect(removeLinkFromMocRelateds(moc.join("\n"), "Z")).toEqual({
			success: false,
			message: "リンクが見つかりません。",
		});
	});

	it("refuses to delete a link that has nested items", () => {
		const nested = "## MOC\n- Relateds\n    - [[A]]\n        - note";
		expect(removeLinkFromMocRelateds(nested, "A")).toMatchObject({ success: false });
	});
});

describe("relatedsLineRange", () => {
	it("covers only the items nested under Relateds", () => {
		const content = [
			"intro [[X]]",
			"## MOC",
			"- Relateds",
			"    - [[A]]",
			"",
			"    - [[B]]",
			"- References",
			"    - [[C]]",
		].join("\n");
		expect(relatedsLineRange(content)).toEqual([3, 6]);
	});

	it("is undefined without a MOC Relateds item", () => {
		expect(relatedsLineRange("## MOC\n- References")).toBeUndefined();
		expect(relatedsLineRange("plain note")).toBeUndefined();
	});
});

describe("isMocOnly", () => {
	const frontmatter = ["---", "createdAt: 2026-10-08T16:21:43", "---"];
	const moc = ["## MOC", "- Relateds", "    - [[Hub]]", "- References"];

	it("treats a note with only frontmatter and its MOC as MOC-only", () => {
		expect(isMocOnly([...frontmatter, "", ...moc, "    - "].join("\n"))).toBe(true);
		expect(
			isMocOnly([...frontmatter, ...moc, "    - [Thread](codex://threads/2)"].join("\r\n")),
		).toBe(true);
	});

	it("is not MOC-only when text is written outside the MOC section", () => {
		expect(isMocOnly([...frontmatter, "A thought.", "", ...moc].join("\n"))).toBe(false);
		expect(isMocOnly([...moc, "## Notes", "More."].join("\n"))).toBe(false);
	});

	it("is not MOC-only without a MOC section", () => {
		expect(isMocOnly([...frontmatter, ""].join("\n"))).toBe(false);
	});
});
