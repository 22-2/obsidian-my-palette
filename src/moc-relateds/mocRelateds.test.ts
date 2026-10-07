import { describe, expect, it } from "vitest";
import {
	addLinkToMocRelateds,
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

	it("does not add the same link twice", () => {
		const content = "## MOC\n- Relateds\n    - [[Existing note]]";
		expect(addLinkToMocRelateds(content, "Existing note", 4)).toEqual({
			success: false,
			message: "Link already exists.",
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
			message: "Link not found.",
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
