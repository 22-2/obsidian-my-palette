import { describe, expect, it } from "vitest";
import {
	isBlocked,
	parseRenameRule,
	planRename,
	renamableRows,
	type RenameOptions,
} from "src/rename/renamePlan";

const defaults: RenameOptions = { regex: false, matchCase: true, all: true };

function plan(
	input: string,
	paths: string[],
	options: Partial<RenameOptions> = {},
	existing: string[] = paths,
) {
	return planRename(
		paths,
		parseRenameRule(input, { ...defaults, ...options }),
		new Set(existing.map((path) => path.toLowerCase())),
	);
}

describe("名前変更ルールの解析", () => {
	it("スラッシュと空ではない検索部分を待ちます", () => {
		expect(parseRenameRule("_", defaults).kind).toBe("none");
		expect(parseRenameRule("/x", defaults).kind).toBe("none");
	});

	it("無効な正規表現を報告します", () => {
		expect(parseRenameRule("(/x", { ...defaults, regex: true }).kind).toBe("error");
	});
});

describe("プラン名の変更", () => {
	it("すべての名前のリテラルテキストを置き換え、拡張子とフォルダーを保持します", () => {
		const rows = plan("_/-", ["a/2026_01_02.md", "b_c.png"]);
		expect(rows.map((row) => row.newPath)).toEqual(["a/2026-01-02.md", "b-c.png"]);
		expect(rows.every((row) => row.status === "ready")).toBe(true);
	});

	it("拡張子と一致することはありません", () => {
		expect(plan("md/x", ["note.md"])[0].status).toBe("unchanged");
	});

	it("すべての出現がオンでない限り、最初の一致のみを置換します。", () => {
		expect(plan("a/b", ["aaa.md"], { all: false })[0].newName).toBe("baa.md");
		expect(plan("a/b", ["aaa.md"])[0].newName).toBe("bbb.md");
	});

	it("優等試合の場合", () => {
		expect(plan("a/x", ["A.md"])[0].status).toBe("unchanged");
		expect(plan("a/x", ["A.md"], { matchCase: false })[0].newName).toBe("x.md");
	});

	it("正規表現モード外ではドルシーケンスのリテラルを保持します", () => {
		expect(plan("a/$&", ["a.md"])[0].newName).toBe("$&.md");
	});

	it("正規表現モードでグループとアンカーをサポートします", () => {
		expect(plan("^(\\d+)/n$1-", ["12 note.md"], { regex: true })[0].newName).toBe(
			"n12- note.md",
		);
	});

	it("Obsidian が拒否するフラグ名", () => {
		expect(plan("a/b/c", ["a.md"], { regex: true })[0].status).toBe("invalid");
		expect(plan("a/", ["a.md"])[0].status).toBe("invalid");
		expect(plan("a/x.", ["a.md"])[0].status).toBe("invalid");
	});

	it("すでに存在する名前にフラグを立てますが、大文字と小文字のみの変更を許可します", () => {
		expect(plan("a/b", ["a.md"], {}, ["a.md", "b.md"])[0].status).toBe("exists");
		expect(plan("a/A", ["a.md"])[0].status).toBe("ready");
	});

	it("同じ新しい名前が付けられるファイルにフラグを付ける", () => {
		const rows = plan("1/", ["x1.md", "x11.md"]);
		expect(rows.map((row) => row.status)).toEqual(["duplicate", "duplicate"]);
	});

	it("行に問題がある場合にのみブロックします", () => {
		expect(isBlocked(plan("a/b", ["a.md", "c.md"]))).toBe(false);
		expect(isBlocked(plan("a/", ["a.md"]))).toBe(true);
		expect(renamableRows(plan("a/b", ["a.md", "c.md"]))).toHaveLength(1);
	});
});
