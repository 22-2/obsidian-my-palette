import { describe, expect, it } from "vitest";
import {
	addLinkToMocRelateds,
	isMocOnly,
	relatedsLineRange,
	removeLinkFromMocRelateds,
} from "src/moc-relateds/mocRelatedsCore";

describe("addLinkToMoc関連", () => {
	it("既存の関連子のインデントを使用してリンクを追加します", () => {
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

	it("ノートに複数の MOC セクションがある場合、最後の MOC セクションに追加します。", () => {
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

	it("子項目の直後にあるリンクも重複として扱う", () => {
		const content = "## MOC\n- Relateds\n    - [[A]]\n- References [[B]]";
		expect(addLinkToMocRelateds(content, "B", 4)).toMatchObject({ success: false });
	});

	it("同じリンクを二度追加しない", () => {
		const content = "## MOC\n- Relateds\n    - [[Existing note]]";
		expect(addLinkToMocRelateds(content, "Existing note", 4)).toEqual({
			success: false,
			message: "リンクはすでにあります。",
		});
	});
});

describe("RemoveLinkFromMoc関連", () => {
	const moc = [
		"## MOC",
		"- Relateds",
		"    - [[A]]",
		"    - [[B|alias]]",
		"- References",
		"    - [[A]]",
	];

	it("エイリアス化されたリンクを含む、一致する関連子のみを削除します", () => {
		expect(removeLinkFromMocRelateds(moc.join("\n"), "B")).toEqual({
			success: true,
			newContent: ["## MOC", "- Relateds", "    - [[A]]", "- References", "    - [[A]]"].join(
				"\n",
			),
		});
	});

	it("関連項目以外のリンクを無視します", () => {
		expect(removeLinkFromMocRelateds(moc.join("\n"), "Z")).toEqual({
			success: false,
			message: "リンクが見つかりません。",
		});
	});

	it("ネストされた項目を含むリンクの削除を拒否します", () => {
		const nested = "## MOC\n- Relateds\n    - [[A]]\n        - note";
		expect(removeLinkFromMocRelateds(nested, "A")).toMatchObject({ success: false });
	});
});

describe("関連LineRange", () => {
	it("関連の下にネストされている項目のみをカバーします", () => {
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

	it("MOC 関連アイテムがなければ定義されていません", () => {
		expect(relatedsLineRange("## MOC\n- References")).toBeUndefined();
		expect(relatedsLineRange("plain note")).toBeUndefined();
	});
});

describe("MOCのみのノート判定", () => {
	const frontmatter = ["---", "createdAt: 2026-10-08T16:21:43", "---"];
	const moc = ["## MOC", "- Relateds", "    - [[Hub]]", "- References"];

	it("フロントマターとその MOC のみを含むノートを MOC のみとして扱います", () => {
		expect(isMocOnly([...frontmatter, "", ...moc, "    - "].join("\n"))).toBe(true);
		expect(
			isMocOnly([...frontmatter, ...moc, "    - [Thread](codex://threads/2)"].join("\r\n")),
		).toBe(true);
	});

	it("テキストが MOC セクションの外に書かれている場合、MOC のみではありません", () => {
		expect(isMocOnly([...frontmatter, "A thought.", "", ...moc].join("\n"))).toBe(false);
		expect(isMocOnly([...moc, "## Notes", "More."].join("\n"))).toBe(false);
	});

	it("MOC セクションがなければ MOC のみではありません", () => {
		expect(isMocOnly([...frontmatter, ""].join("\n"))).toBe(false);
	});
});
