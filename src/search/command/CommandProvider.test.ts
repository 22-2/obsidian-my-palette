import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { CommandProvider } from "src/search/command/CommandProvider";
import { sortCommandMatches } from "src/search/command/commandSorting";

const commands = vi.hoisted(() => [
	{ id: "editor:toggle-bold", name: "Editor: Toggle bold" },
	{ id: "daily-notes:open", name: "Daily notes: Open today's note" },
]);

vi.mock("obsidian", () => ({}));
vi.mock("src/platform/obsidianInternals", () => ({ getCommands: () => commands }));

const request = (query: string) => ({ mode: "command" as const, query });

function match(id: string, name: string, fuzzyScore = 0) {
	return { command: { id, name }, fuzzyScore };
}

describe("コマンド検索結果の並べ替え", () => {
	it("プラグイン名が一致し、コマンドを予想どおりに並べ替えるグループを作成します", () => {
		const results = sortCommandMatches(
			[
				match("toolkit:export", "@Novel Toolkit: Export novel data", 100),
				match("other:format", "@My Commands Plugin: Format novel text", 500),
				match("toolkit:delete", "@Novel Toolkit: Delete all remote novels", 300),
				match("reader:external", "Novel Reader: Open External File", 50),
				match("reader:current", "Novel Reader: Open Novel Reader", 25),
			],
			"novel",
		);

		expect(results.map(({ id }) => id)).toEqual([
			"toolkit:delete",
			"toolkit:export",
			"reader:external",
			"reader:current",
			"other:format",
		]);
	});

	it("テキストが直接一致しない場合はあいまい関連性を使用します", () => {
		const results = sortCommandMatches(
			[
				match("lower", "Tools: Export document", 10),
				match("higher", "Notes: Explore document", 20),
			],
			"exdoc",
		);

		expect(results.map(({ id }) => id)).toEqual(["higher", "lower"]);
	});

	it("複数の単語の一致をあいまいな文字の距離ではなくコマンド名でソートします", () => {
		const results = sortCommandMatches(
			[
				match("navigate", "@My Commands Plugin: Navigate to outgoing link", 100),
				match("copy", "@My Commands Plugin: Copy file path with outgoing link paths", 10),
			],
			"my commands outgoing",
		);

		expect(results.map(({ id }) => id)).toEqual(["copy", "navigate"]);
	});

	it("プラグイン間で等しい単一単語の一致をアクション名でソートします", () => {
		const results = sortCommandMatches(
			[
				match("open", "GridExplorer: Open outgoing links in grid view", 100),
				match("copy", "@My Commands Plugin: Copy file path with outgoing link paths", 10),
			],
			"outgoing",
		);

		expect(results.map(({ id }) => id)).toEqual(["copy", "open"]);
	});
});

describe("コマンドプロバイダー", () => {
	it("コマンドを名前だけでなく ID からも検索します。", async () => {
		const provider = new CommandProvider({} as App, () => []);

		const byId = await provider.search(request("toggle-bold"));
		expect(byId.map(({ commandId }) => commandId)).toContain("editor:toggle-bold");

		const byName = await provider.search(request("Toggle bold"));
		expect(byName[0]?.commandId).toBe("editor:toggle-bold");
	});
});
