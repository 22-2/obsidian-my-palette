import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import {
	findPaletteMode,
	availableModes,
	matchPaletteModes,
	PALETTE_MODES,
	paletteModeAlias,
	parseDirectModeEntry,
	validateModeAlias,
} from "src/palette/modes";

const modes = DEFAULT_SETTINGS.modes;
const ids = (input: string) => matchPaletteModes(input, modes).map(({ id }) => id);

test("初期化された統合のみをリストしたり、エイリアスで入力したりできます", () => {
	const available = availableModes(DEFAULT_SETTINGS, {
		everything: false,
		smartConnections: false,
	});
	expect(matchPaletteModes("", available).map(({ id }) => id)).not.toContain("everything");
	expect(parseDirectModeEntry("sc report", available)).toBeUndefined();
	expect(available.notes.enabled).toBe(true);
});

describe("パレットモードエイリアス", () => {
	test("設定でエイリアスを使用する", () => {
		expect(paletteModeAlias("commands", modes)).toBe(">");
		expect(paletteModeAlias("everything", modes)).toBe("e");
		expect(paletteModeAlias("plugins", modes)).toBe("p");
		expect(paletteModeAlias("snippets", modes)).toBe("sn");
	});

	test("変更されたエイリアスがモードに入ります。", () => {
		const changed = { ...modes, commands: { alias: "c", enabled: true } };
		expect(paletteModeAlias("commands", changed)).toBe("c");
		expect(parseDirectModeEntry("c link", changed)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("> link", changed)).toBeUndefined();
	});
});

describe("パレットモードの一致", () => {
	test("Home with Notes を起動し、組み込みのファイル検索を開始します", () => {
		expect(ids("")[0]).toBe("notes");
		expect(findPaletteMode("file")?.id).toBe("notes");
		expect(parseDirectModeEntry("n report", modes)).toEqual({
			modeId: "notes",
			query: "report",
		});
	});
	test("ホームおよびエイリアスエントリから無効なモードを残します", () => {
		const disabled = { ...modes, commands: { ...modes.commands, enabled: false } };
		expect(matchPaletteModes("", disabled).map(({ id }) => id)).not.toContain("commands");
		expect(matchPaletteModes("> ", disabled)).toEqual([]);
		expect(parseDirectModeEntry("> link", disabled)).toBeUndefined();
		expect(paletteModeAlias("commands", disabled)).toBe(">");
	});

	test("空の入力に対するすべてのモードをリストします。", () => {
		expect(ids("  ")).toEqual(PALETTE_MODES.map(({ id }) => id));
	});

	test("大文字と小文字を区別せずに英語名でモードを検索します", () => {
		expect(ids("prop")).toEqual(["properties"]);
		expect(ids("VAULT au")).toEqual(["audit"]);
		expect(ids("related")).toEqual(["smart"]);
		expect(ids("out links")).toEqual(["outlinks"]);
	});

	test("タブの後にプラグインをリストし、エイリアスで入力します", () => {
		const order = ids("");
		expect(order.at(-4)).toBe("snippets");
		expect(order.at(-3)).toBe("properties");
		expect(order.at(-2)).toBe("audit");
		expect(order.at(-1)).toBe("tags");
		expect(order.indexOf("tabs")).toBeLessThan(order.indexOf("plugins"));
		expect(order.indexOf("plugins")).toBeLessThan(order.indexOf("snippets"));
		expect(parseDirectModeEntry("pr status", modes)).toEqual({
			modeId: "properties",
			query: "status",
		});
		expect(parseDirectModeEntry("p alpha", modes)).toEqual({
			modeId: "plugins",
			query: "alpha",
		});
		expect(parseDirectModeEntry("sn beta", modes)).toEqual({
			modeId: "snippets",
			query: "beta",
		});
	});

	test("エイリアス接頭辞の前に正確なエイリアスを置きます", () => {
		expect(ids("b")).toEqual(["backlinks", "bookmarks"]);
		expect(ids("e")[0]).toBe("everything");
		expect(ids("esdir")).toEqual([]);
	});

	test("タイトルとサブタイトルの単語の先頭と一致します", () => {
		expect(ids("タブ")).toEqual(["tabs"]);
		expect(ids("発リンク")).toEqual(["outlinks"]);
		expect(ids("smart")).toEqual(["smart"]);
	});

	test("途中の単語と一致しません", () => {
		expect(ids("acklinks")).toEqual([]);
	});
});

describe("モード直接入力の解析", () => {
	test("残りの入力をクエリとして使用するモードに入ります。", () => {
		expect(parseDirectModeEntry("e report", modes)).toEqual({
			modeId: "everything",
			query: "report",
		});
		expect(parseDirectModeEntry("> link", modes)).toEqual({
			modeId: "commands",
			query: "link",
		});
		expect(parseDirectModeEntry("bk ", modes)).toEqual({ modeId: "bookmarks", query: "" });
	});

	test("古い es エイリアスはエントリ ポイントではなくなりました", () => {
		expect(parseDirectModeEntry("es notes", modes)).toBeUndefined();
	});

	test("エイリアスの後にスペースが必要です", () => {
		expect(parseDirectModeEntry("esdir", modes)).toBeUndefined();
		expect(parseDirectModeEntry("books", modes)).toBeUndefined();
		expect(parseDirectModeEntry("estate", modes)).toBeUndefined();
	});
});

describe("パレットモードの検索", () => {
	test("両方の検索範囲に対して 1 つの Everything モードを使用します", () => {
		expect(findPaletteMode("everything")?.id).toBe("everything");
		expect(findPaletteMode("link")?.id).toBe("outlinks");
	});
});

describe("モードエイリアスの検証", () => {
	test("別のエイリアスと開始点のみを共有するエイリアスを受け入れます", () => {
		expect(validateModeAlias("everything", "e", modes)).toBeUndefined();
		expect(validateModeAlias("commands", "c", modes)).toBeUndefined();
		expect(validateModeAlias("everything", "es", modes)).toBeUndefined();
	});

	test("空のエイリアス、スペースを空けたエイリアス、取得されたエイリアスを拒否します", () => {
		expect(validateModeAlias("commands", " ", modes)).toBe("エイリアスを入力してください。");
		expect(validateModeAlias("commands", "c x", modes)).toBe("エイリアスに空白は使えません。");
		expect(validateModeAlias("commands", "E", modes)).toBe(
			'"E" はほかのモードですでに使われています。',
		);
		expect(validateModeAlias("commands", "esdir", modes)).toBeUndefined();
		// es is free again, since it is no longer a hidden alias.
		expect(validateModeAlias("commands", "es", modes)).toBeUndefined();
	});
});
