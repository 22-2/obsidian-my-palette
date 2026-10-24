import { describe, expect, it } from "vitest";
import {
	buildMergedBody,
	mergeFrontmatter,
	retargetLinks,
	splitFrontmatter,
	type LinkResolver,
} from "src/merge/mergeText";

// Why: 実際の解決と同じく、名前だけのリンクは同じ名前のノートに解決する。
const files = ["a.md", "b.md", "c.md", "folder/a.md", "folder/b.md", "moc.md"];
const resolve: LinkResolver = (linkpath) => {
	const wanted = linkpath.toLowerCase();
	return (
		files.find((path) => path.toLowerCase() === `${wanted}.md`) ??
		files.find((path) => path.toLowerCase() === wanted) ??
		null
	);
};
const target = { path: "b.md", basename: "b" };
const moved = new Set(["a.md"]);

describe("スプリットフロントマター", () => {
	it("先頭の前物質ブロックを本体から分離します", () => {
		expect(splitFrontmatter("---\ntags: x\n---\nbody\n")).toEqual({
			frontmatter: "---\ntags: x\n---\n",
			body: "body\n",
		});
	});
	it("前付部分のないメモをすべて保持します", () => {
		expect(splitFrontmatter("body")).toEqual({ frontmatter: "", body: "body" });
	});
});

describe("リターゲットリンク", () => {
	it("移動したメモへのリンクをターゲットにポイントし、見出し、エイリアス、埋め込みを維持します", () => {
		const result = retargetLinks(
			"see [[a]], [[a#見出し]], [[a|別名]], ![[a]] and [[c]]",
			"c.md",
			target,
			moved,
			resolve,
		);
		expect(result).toEqual({
			content: "see [[b]], [[b#見出し]], [[b|別名]], ![[b]] and [[c]]",
			count: 4,
		});
	});
	it("元のリンクがフォルダーに書き込まれたときにターゲット パスを使用します。", () => {
		const nested = new Set(["folder/a.md"]);
		const result = retargetLinks("[[folder/a]]", "c.md", target, nested, resolve);
		expect(result.content).toBe("[[b]]");
		expect(
			retargetLinks("[[a]]", "c.md", { path: "folder/b.md", basename: "b" }, moved, resolve)
				.content,
		).toBe("[[b]]");
	});
	it("移動したものにリンクしていない場合はメモをそのまま残します", () => {
		const content = "[[c]] and text";
		expect(retargetLinks(content, "moc.md", target, moved, resolve)).toEqual({
			content,
			count: 0,
		});
	});
	it("ターゲットを指すようになった重複した裸のリンク線をドロップします。", () => {
		const content = ["## MOC", "- Relateds", "\t- [[a]]", "\t- [[b]]", "\t- [[c]]"].join("\n");
		const result = retargetLinks(content, "moc.md", target, moved, resolve);
		expect(result.content).toBe(["## MOC", "- Relateds", "\t- [[b]]", "\t- [[c]]"].join("\n"));
		expect(result.count).toBe(1);
	});
});

describe("結合後の本文作成", () => {
	it("ターゲットを最初に配置し、その後にソースを配置し、それぞれパス マーカーの下に配置します。", () => {
		const body = buildMergedBody(
			[{ path: "a.md", body: "aaa\n" }],
			{ path: "b.md", body: "bbb\n" },
			new Set(["a.md", "b.md"]),
			resolve,
		);
		expect(body).toBe("%%b.md%%\n\nbbb\n\n%%a.md%%\n\naaa\n");
	});
	it("マージされたノート間のリンクを削除し、他のリンクは保持します", () => {
		const body = buildMergedBody(
			[{ path: "a.md", body: "- [[b]]\nsee [[b|bee]] and [[c]]\n" }],
			{ path: "b.md", body: "self [[a]]\n" },
			new Set(["a.md", "b.md"]),
			resolve,
		);
		expect(body).toBe("%%b.md%%\n\nself a\n\n%%a.md%%\n\nsee bee and [[c]]\n");
	});
});

describe("マージフロントマター", () => {
	it("不足しているキーを追加し、ターゲット値を保持し、競合を報告します", () => {
		const frontmatter: Record<string, unknown> = { status: "done", rating: 3 };
		const conflicts = mergeFrontmatter(
			frontmatter,
			"b",
			[{ basename: "a", frontmatter: { status: "todo", rating: 3, due: "2026-01-01" } }],
			{ aliasSourceNames: true },
		);
		expect(conflicts).toEqual(["status"]);
		expect(frontmatter).toMatchObject({ status: "done", rating: 3, due: "2026-01-01" });
	});
	it("タグを結合し、ソース名をエイリアスに追加します", () => {
		const frontmatter: Record<string, unknown> = { tags: ["x"], aliases: ["bee"] };
		mergeFrontmatter(
			frontmatter,
			"b",
			[{ basename: "a", frontmatter: { tags: "y x", aliases: ["ay"] } }],
			{ aliasSourceNames: true },
		);
		expect(frontmatter.tags).toEqual(["x", "y"]);
		expect(frontmatter.aliases).toEqual(["bee", "ay", "a"]);
	});
	it("オプションがオフの場合、ソース名はエイリアスから除外されます。", () => {
		const frontmatter: Record<string, unknown> = { aliases: ["bee"] };
		mergeFrontmatter(frontmatter, "b", [{ basename: "a", frontmatter: { aliases: ["ay"] } }], {
			aliasSourceNames: false,
		});
		expect(frontmatter.aliases).toEqual(["bee", "ay"]);
	});
	it("ターゲット自身の名前をエイリアスとして追加せず、内部位置キーを無視します。", () => {
		const frontmatter: Record<string, unknown> = {};
		const conflicts = mergeFrontmatter(
			frontmatter,
			"a",
			[{ basename: "a", frontmatter: { position: { start: 0 } } }],
			{ aliasSourceNames: true },
		);
		expect(conflicts).toEqual([]);
		expect(frontmatter).toEqual({});
	});
});
