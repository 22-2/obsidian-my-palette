import { describe, expect, it } from "vitest";
import { buildTagChoices, countTagsInNotes, MAX_RELATED_TAGS } from "src/tags/tagChoices";

describe("メモ内のタグの数", () => {
	it("大文字と小文字とハッシュを無視して、ノートごとに各タグを 1 回カウントします", () => {
		expect(countTagsInNotes([["#Project", "project", "#todo"], ["#project"]])).toEqual(
			new Map([
				["project", 2],
				["todo", 1],
			]),
		);
	});
});

describe("タグ候補の作成", () => {
	it("最近の注文、関連する注文、使用回数、次に登録されたタグ", () => {
		const choices = buildTagChoices({
			allTags: { "#common": 50, "#rare": 1, "#linked": 3, "#recent": 2, "#mine": 99 },
			registeredTags: ["mine"],
			recentTags: ["Recent"],
			relatedNoteTags: [["#linked", "#mine", "#recent"], ["#linked"]],
		});

		expect(choices).toEqual([
			{ tag: "recent", count: 2, registered: false, reason: "recent" },
			{ tag: "linked", count: 3, registered: false, reason: "related", relatedCount: 2 },
			{ tag: "common", count: 50, registered: false },
			{ tag: "rare", count: 1, registered: false },
			{ tag: "mine", count: 99, registered: true },
		]);
	});

	it("使用回数が異なる場合でも、最近の注文を保持します", () => {
		const choices = buildTagChoices({
			allTags: { "#a": 1, "#b": 100 },
			registeredTags: [],
			recentTags: ["a", "b"],
			relatedNoteTags: [],
		});
		expect(choices.map(({ tag }) => tag)).toEqual(["a", "b"]);
	});

	it("最近のタグまたは登録されたタグが関連する制限を消費しないようにします", () => {
		const relatedTags = Array.from({ length: MAX_RELATED_TAGS + 2 }, (_, i) => `#t${i}`);
		const allTags = Object.fromEntries(relatedTags.map((tag) => [tag, 1]));
		const choices = buildTagChoices({
			allTags,
			registeredTags: ["t0"],
			recentTags: ["t1"],
			relatedNoteTags: [relatedTags],
		});

		expect(choices.filter(({ reason }) => reason === "related")).toHaveLength(MAX_RELATED_TAGS);
		expect(choices.find(({ tag }) => tag === "t0")?.reason).toBeUndefined();
		expect(choices.find(({ tag }) => tag === "t1")?.reason).toBe("recent");
	});

	it("部分的に適用されたタグを削除できるように、タグを持つターゲットの数を記録します", () => {
		const choices = buildTagChoices({
			allTags: { "#half": 3, "#none": 1 },
			registeredTags: [],
			appliedCounts: new Map([["half", 2]]),
			recentTags: [],
			relatedNoteTags: [],
		});
		expect(choices.find(({ tag }) => tag === "half")?.appliedCount).toBe(2);
		expect(choices.find(({ tag }) => tag === "none")).not.toHaveProperty("appliedCount");
	});
});
