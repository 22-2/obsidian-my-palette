import { describe, expect, it } from "vitest";
import { buildTagChoices, countTagsInNotes, MAX_RELATED_TAGS } from "src/tags/tagChoices";

describe("countTagsInNotes", () => {
	it("counts each tag once per note, ignoring case and hashes", () => {
		expect(countTagsInNotes([["#Project", "project", "#todo"], ["#project"]])).toEqual(
			new Map([
				["project", 2],
				["todo", 1],
			]),
		);
	});
});

describe("buildTagChoices", () => {
	it("orders recent, related, usage count, then registered tags", () => {
		const choices = buildTagChoices({
			allTags: { "#common": 50, "#rare": 1, "#linked": 3, "#recent": 2, "#mine": 99 },
			registeredTags: ["mine"],
			presentTags: ["mine", "#Rare"],
			recentTags: ["Recent"],
			relatedNoteTags: [["#linked", "#mine", "#recent"], ["#linked"]],
		});

		expect(choices).toEqual([
			{ tag: "recent", count: 2, registered: false, present: false, reason: "recent" },
			{
				tag: "linked",
				count: 3,
				registered: false,
				present: false,
				reason: "related",
				relatedCount: 2,
			},
			{ tag: "common", count: 50, registered: false, present: false },
			// Present on only some targets: still selectable, but removable too.
			{ tag: "rare", count: 1, registered: false, present: true },
			{ tag: "mine", count: 99, registered: true, present: true },
		]);
	});

	it("keeps the recent order even when the usage count differs", () => {
		const choices = buildTagChoices({
			allTags: { "#a": 1, "#b": 100 },
			registeredTags: [],
			presentTags: [],
			recentTags: ["a", "b"],
			relatedNoteTags: [],
		});
		expect(choices.map(({ tag }) => tag)).toEqual(["a", "b"]);
	});

	it("does not let recent or registered tags consume the related limit", () => {
		const relatedTags = Array.from({ length: MAX_RELATED_TAGS + 2 }, (_, i) => `#t${i}`);
		const allTags = Object.fromEntries(relatedTags.map((tag) => [tag, 1]));
		const choices = buildTagChoices({
			allTags,
			registeredTags: ["t0"],
			presentTags: ["t0"],
			recentTags: ["t1"],
			relatedNoteTags: [relatedTags],
		});

		expect(choices.filter(({ reason }) => reason === "related")).toHaveLength(MAX_RELATED_TAGS);
		expect(choices.find(({ tag }) => tag === "t0")?.reason).toBeUndefined();
		expect(choices.find(({ tag }) => tag === "t1")?.reason).toBe("recent");
	});
});
