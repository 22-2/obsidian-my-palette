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

describe("splitFrontmatter", () => {
	it("separates a leading frontmatter block from the body", () => {
		expect(splitFrontmatter("---\ntags: x\n---\nbody\n")).toEqual({
			frontmatter: "---\ntags: x\n---\n",
			body: "body\n",
		});
	});
	it("keeps a note without frontmatter whole", () => {
		expect(splitFrontmatter("body")).toEqual({ frontmatter: "", body: "body" });
	});
});

describe("retargetLinks", () => {
	it("points links to a moved note at the target and keeps heading, alias and embed", () => {
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
	it("uses the target path when the original link was written with a folder", () => {
		const nested = new Set(["folder/a.md"]);
		const result = retargetLinks("[[folder/a]]", "c.md", target, nested, resolve);
		expect(result.content).toBe("[[b]]");
		expect(
			retargetLinks("[[a]]", "c.md", { path: "folder/b.md", basename: "b" }, moved, resolve)
				.content,
		).toBe("[[b]]");
	});
	it("leaves a note alone when it links to nothing that moved", () => {
		const content = "[[c]] and text";
		expect(retargetLinks(content, "moc.md", target, moved, resolve)).toEqual({
			content,
			count: 0,
		});
	});
	it("drops a duplicate bare link line that now points at the target", () => {
		const content = ["## MOC", "- Relateds", "\t- [[a]]", "\t- [[b]]", "\t- [[c]]"].join("\n");
		const result = retargetLinks(content, "moc.md", target, moved, resolve);
		expect(result.content).toBe(["## MOC", "- Relateds", "\t- [[b]]", "\t- [[c]]"].join("\n"));
		expect(result.count).toBe(1);
	});
});

describe("buildMergedBody", () => {
	it("places the target first and the sources after it, each under a path marker", () => {
		const body = buildMergedBody(
			[{ path: "a.md", body: "aaa\n" }],
			{ path: "b.md", body: "bbb\n" },
			new Set(["a.md", "b.md"]),
			resolve,
		);
		expect(body).toBe("%%b.md%%\n\nbbb\n\n%%a.md%%\n\naaa\n");
	});
	it("removes links between merged notes and keeps other links", () => {
		const body = buildMergedBody(
			[{ path: "a.md", body: "- [[b]]\nsee [[b|bee]] and [[c]]\n" }],
			{ path: "b.md", body: "self [[a]]\n" },
			new Set(["a.md", "b.md"]),
			resolve,
		);
		expect(body).toBe("%%b.md%%\n\nself a\n\n%%a.md%%\n\nsee bee and [[c]]\n");
	});
});

describe("mergeFrontmatter", () => {
	it("adds missing keys, keeps target values and reports conflicts", () => {
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
	it("unions tags and adds the source name to aliases", () => {
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
	it("leaves the source name out of aliases when the option is off", () => {
		const frontmatter: Record<string, unknown> = { aliases: ["bee"] };
		mergeFrontmatter(frontmatter, "b", [{ basename: "a", frontmatter: { aliases: ["ay"] } }], {
			aliasSourceNames: false,
		});
		expect(frontmatter.aliases).toEqual(["bee", "ay"]);
	});
	it("does not add the target's own name as an alias and ignores the internal position key", () => {
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
