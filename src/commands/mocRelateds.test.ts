import { describe, expect, it } from "vitest";
import { addLinkToMocRelateds } from "src/commands/mocRelatedsCore";

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
