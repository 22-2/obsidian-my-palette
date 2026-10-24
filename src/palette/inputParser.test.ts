import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";

const modes = DEFAULT_SETTINGS.modes;

describe("黒曜石を除く範囲", () => {
	it("スイッチによってスコープが設定されるため、ファイル クエリの先頭に i が残ります。", () => {
		expect(parseInput("i old meeting", modes)).toEqual({
			raw: "i old meeting",
			mode: "file",
			query: "i old meeting",
		});
	});
});

describe("parseInput すべてのスコープ", () => {
	it("もはや es に特別な意味を与えない", () => {
		expect(parseInput("es", modes)).toMatchObject({ mode: "file", query: "es" });
		expect(parseInput("es ", modes)).toMatchObject({ mode: "file" });
	});

	it("Everything エイリアスとそのネイティブ構文を保持します", () => {
		expect(parseInput('e content:"e"', modes)).toMatchObject({
			mode: "everything",
			query: 'content:"e"',
			everythingScope: "vault",
		});
	});

	it("ベアディレクトリのショートカットとそのスペース形式をサポートします", () => {
		expect(parseInput("esdir", modes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
		expect(parseInput("esdir ", modes)).toMatchObject({
			mode: "everything",
			query: "",
			everythingScope: "directory",
		});
	});

	it("es で始まる通常の単語を接頭辞として扱いません。", () => {
		expect(parseInput("estate", modes)).toMatchObject({ mode: "file", query: "estate" });
	});
});

it("コマンドモードを切り替える前に末尾のスペースが必要です", () => {
	expect(parseInput(">", modes)).toMatchObject({ mode: "file", query: ">" });
	expect(parseInput("> ", modes)).toMatchObject({
		mode: "command",
		query: "",
	});
});

describe("ブックマークプレフィックス", () => {
	it("bk に続けてスペースを入力した場合にのみブックマーク検索に切り替わります", () => {
		expect(parseInput("bk", modes)).toMatchObject({ mode: "file", query: "bk" });
		expect(parseInput("bk ", modes)).toMatchObject({ mode: "bookmark", query: "" });
		expect(parseInput("bk project", modes)).toMatchObject({
			mode: "bookmark",
			query: "project",
		});
	});

	it("bk で始まる通常の単語を接頭辞として扱いません。", () => {
		expect(parseInput("books", modes)).toMatchObject({ mode: "file", query: "books" });
	});
});

describe("スマート接続プレフィックス", () => {
	it("sc に続けてスペースを入力した場合にのみ、スマート接続検索に切り替わります。", () => {
		expect(parseInput("sc", modes)).toMatchObject({ mode: "file", query: "sc" });
		expect(parseInput("sc ", modes)).toMatchObject({ mode: "smart", query: "" });
		expect(parseInput("sc values", modes)).toMatchObject({
			mode: "smart",
			query: "values",
		});
	});
});

describe("タブの接頭辞", () => {
	it("t にスペースが続く場合のみタブ検索に切り替わります", () => {
		expect(parseInput("t", modes)).toMatchObject({ mode: "file", query: "t" });
		expect(parseInput("t ", modes)).toMatchObject({ mode: "tab", query: "" });
		expect(parseInput("t daily", modes)).toMatchObject({ mode: "tab", query: "daily" });
	});
});

describe("関連する音符の接頭辞", () => {
	it("o プレフィックスを使用した発信リンク検索に切り替えます", () => {
		expect(parseInput("o ", modes)).toMatchObject({ mode: "link", query: "" });
		expect(parseInput("o project", modes)).toMatchObject({
			mode: "link",
			query: "project",
		});
	});

	it("ブックマークと衝突せずに b で被リンク検索に切り替えます", () => {
		expect(parseInput("b project", modes)).toMatchObject({
			mode: "backlink",
			query: "project",
		});
		expect(parseInput("bk project", modes)).toMatchObject({ mode: "bookmark" });
	});
});

it("履歴をモードとすべてのスコープごとに分類します", () => {
	expect(getSearchHistoryCategory(parseInput("report", modes))).toBe("file");
	expect(getSearchHistoryCategory(parseInput("> report", modes))).toBe("command");
	expect(getSearchHistoryCategory(parseInput("e report", modes))).toBe("everything");
	expect(getSearchHistoryCategory(parseInput("esdir report", modes))).toBe(
		"everything-directory",
	);
});
