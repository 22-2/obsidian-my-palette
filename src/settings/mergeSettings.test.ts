import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	UNLIMITED_DAYS,
} from "src/settings/model";
import { mergeSettings } from "src/settings/mergeSettings";

describe("マージ設定", () => {
	it("既存の構成済みフォルダーに対して、独立したフォルダーの降格を 1 回有効にします", () => {
		const settings = mergeSettings({
			schemaVersion: 17,
			file: {
				demotedPriorFolders: ["archive"],
				sortPriorities: { blank: ["Activity"], input: ["Filename fuzzy match"] },
			},
		});
		expect(settings.file.sortPriorities).toEqual({
			blank: ["Lower prior folders", "Activity"],
			input: ["Lower prior folders", "Filename fuzzy match"],
		});
		settings.file.sortPriorities.blank = ["Activity"];
		expect(mergeSettings(settings).file.sortPriorities.blank).toEqual(["Activity"]);
	});

	it("共有ハイライトを独立したサーフェス設定に移行します", () => {
		const settings = mergeSettings({ schemaVersion: 16, highlightSearchMatches: false });
		expect(settings.paletteDisplay).toEqual({
			table: { highlightSearchMatches: false },
			view: { highlightSearchMatches: false },
			palette: { highlightSearchMatches: false },
		});
		expect(settings.paletteDisplay.table).not.toBe(settings.paletteDisplay.view);
		expect(settings).not.toHaveProperty("highlightSearchMatches");
	});

	it("各サーフェスを復元し、無効な表示設定をサニタイズします", () => {
		expect(
			mergeSettings({
				paletteDisplay: {
					table: { highlightSearchMatches: false },
					view: { highlightSearchMatches: "false" },
					palette: null,
				},
			}).paletteDisplay,
		).toEqual({
			table: { highlightSearchMatches: false },
			view: { highlightSearchMatches: true },
			palette: { highlightSearchMatches: true },
		});
	});

	it("不足しているデータを文書化されたデフォルトで埋める", () => {
		expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("保存されているエイリアスが空の場合、デフォルトのエイリアスに戻ります", () => {
		expect(
			mergeSettings({ modes: { commands: { alias: " " }, everything: { alias: "ev" } } })
				.modes,
		).toEqual({
			...DEFAULT_SETTINGS.modes,
			everything: { alias: "ev", enabled: true },
		});
	});

	it("保存された設定がオフにならない限り、モードは有効のままになります", () => {
		expect(mergeSettings({ modes: { tabs: { alias: "t" } } }).modes.tabs).toEqual({
			alias: "t",
			enabled: true,
		});
		expect(
			mergeSettings({ modes: { tabs: { alias: "t", enabled: false } } }).modes.tabs.enabled,
		).toBe(false);
	});

	it("スキーマ 18 の接頭辞を末尾のスペースなしでモード エイリアスに移動します", () => {
		const settings = mergeSettings({
			schemaVersion: 18,
			prefixes: { command: "c ", everything: "ev " },
		});
		expect(settings.modes.commands).toEqual({ alias: "c", enabled: true });
		expect(settings.modes.everything).toEqual({ alias: "ev", enabled: true });
		expect(settings).not.toHaveProperty("prefixes");
	});

	it("残っているプレフィックスよりも、すでに保存されているモード エイリアスを優先します。", () => {
		expect(
			mergeSettings({
				schemaVersion: 19,
				modes: { commands: { alias: "c" } },
				prefixes: { command: "old " },
			}).modes.commands,
		).toEqual({ alias: "c", enabled: true });
	});

	it("デフォルトの履歴保持は無制限です", () => {
		expect(DEFAULT_SETTINGS.searchHistory.addDelayMs).toBe(0);
		expect(DEFAULT_SETTINGS.searchHistory.daysToKeep).toBe(UNLIMITED_DAYS);
		expect(mergeSettings({ searchHistory: {} }).searchHistory.daysToKeep).toBe(UNLIMITED_DAYS);
	});

	it("古いアイドル履歴のデフォルトをアクションのみの履歴に移行します。", () => {
		expect(
			mergeSettings({
				schemaVersion: 11,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(0);
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(3_000);
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION - 1,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(3_000);
	});

	it("関連性、以前、および最近の順にファイルをデフォルトで並べ替えます", () => {
		expect(mergeSettings(undefined).file.sortPriorities).toEqual({
			blank: ["Activity", "Last modified", "@prior:desc"],
			input: [
				"Filename prefix match",
				"Filename fuzzy match",
				"Alias prefix match",
				"Alias fuzzy match",
				"Tag match",
				"Match coverage",
				"Folder path match",
				"@prior:desc",
				"Activity",
				"Last modified",
			],
		});
	});

	it("数値設定を制限し、拡張機能をサニタイズします", () => {
		const settings = mergeSettings({
			searchHistory: { addDelayMs: -1, daysToKeep: 99999 },
			everything: {
				maxResults: 999,
				debounceMs: 1,
				requestTimeoutMs: 99999,
				vaultExtensions: [".MD", "md", "bad value", 42],
			},
		});

		expect(settings.searchHistory.addDelayMs).toBe(0);
		expect(settings.searchHistory.daysToKeep).toBe(SETTING_LIMITS.searchHistory.daysToKeep.max);
		expect(settings.everything.maxResults).toBe(SETTING_LIMITS.everything.maxResults.max);
		expect(settings.everything.debounceMs).toBe(SETTING_LIMITS.everything.debounceMs.min);
		expect(settings.everything.requestTimeoutMs).toBe(
			SETTING_LIMITS.everything.requestTimeoutMs.max,
		);
		expect(settings.everything.vaultExtensions).toEqual(["md"]);
	});

	it("設定されたファイルの並べ替え優先順位を正規化し、無効な値を無視します", () => {
		const settings = mergeSettings({
			file: {
				sortPriorities: [
					" @prior:asc ",
					"Aliases count",
					"Last opened",
					"Usage history",
					"@title:desc",
					42,
					"unknown",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual({
			blank: ["@prior:asc", "Aliases count", "Activity"],
			input: ["@prior:asc", "Aliases count", "Activity"],
		});
	});

	it("以前の結合された名前の優先順位を移行します", () => {
		const settings = mergeSettings({
			schemaVersion: 9,
			file: {
				sortPriorities: [
					"Prefix name match",
					"Fuzzy name match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
		expect(settings.file.sortPriorities.blank).toEqual([
			"Activity",
			"Last modified",
			"@prior:desc",
		]);
		expect(settings.file.sortPriorities.input).toEqual([
			"Filename prefix match",
			"Filename fuzzy match",
			"Alias prefix match",
			"Alias fuzzy match",
			"Tag match",
			"Match coverage",
			"Folder path match",
			"@prior:desc",
			"Activity",
			"Last modified",
		]);
	});

	it("タグの優先順位を未変更の以前のデフォルトに追加します", () => {
		const settings = mergeSettings({
			schemaVersion: 10,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("未変更の以前のデフォルトにアクティビティを追加します", () => {
		const settings = mergeSettings({
			schemaVersion: 13,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Tag match",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("以前のアクティビティのデフォルトを移行します", () => {
		const settings = mergeSettings({
			schemaVersion: SETTINGS_SCHEMA_VERSION,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Tag match",
					"Match coverage",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Usage history",
					"Last modified",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("空白の入力と入力された入力に対して独立したソート優先順位を保持します。", () => {
		const settings = mergeSettings({
			file: {
				sortPriorities: {
					blank: ["Last opened", "Last modified"],
					input: ["Filename fuzzy match", "@prior:desc"],
				},
			},
		});

		expect(settings.file.sortPriorities).toEqual({
			blank: ["Activity", "Last modified"],
			input: ["Filename fuzzy match", "@prior:desc"],
		});
	});
});

describe("メモモードの移行", () => {
	it("既存のエイリアスを変更せずに自由なエイリアスを選択します", () => {
		const settings = mergeSettings({
			modes: {
				commands: { alias: "N", enabled: true },
				tabs: { alias: "notes", enabled: true },
			},
		});
		expect(settings.modes.commands.alias).toBe("N");
		expect(settings.modes.notes.alias).toBe("notes2");
	});
});

describe("プラグインモードの移行", () => {
	it("既存の設定のデフォルトのエイリアスを使用してモードを追加します", () => {
		const settings = mergeSettings({ modes: { tabs: { alias: "t" } } });
		expect(settings.modes.plugins).toEqual({ alias: "p", enabled: true });
	});

	it("エイリアスがすでに取得されている場合、新しいモードを脇に移動します", () => {
		const settings = mergeSettings({
			modes: { commands: { alias: "p", enabled: true } },
		});
		expect(settings.modes.commands.alias).toBe("p");
		expect(settings.modes.plugins.alias).toBe("plugins");
	});
});

describe("スニペット モードの移行", () => {
	it("既存の設定のデフォルトのエイリアスを使用してモードを追加します", () => {
		const settings = mergeSettings({ modes: { tabs: { alias: "t" } } });
		expect(settings.modes.snippets).toEqual({ alias: "sn", enabled: true });
	});

	it("エイリアスがすでに取得されている場合、新しいモードを脇に移動します", () => {
		const settings = mergeSettings({
			modes: { smart: { alias: "sn", enabled: true } },
		});
		expect(settings.modes.smart.alias).toBe("sn");
		expect(settings.modes.snippets.alias).toBe("snippets");
	});
});

describe("プロパティモードの移行", () => {
	it("既存の設定のデフォルトのエイリアスを使用してモードを追加します", () => {
		const settings = mergeSettings({ modes: { snippets: { alias: "sn" } } });
		expect(settings.modes.properties).toEqual({ alias: "pr", enabled: true });
	});

	it("エイリアスがすでに取得されている場合、新しいモードを脇に移動します", () => {
		const settings = mergeSettings({
			modes: { smart: { alias: "pr", enabled: true } },
		});
		expect(settings.modes.smart.alias).toBe("pr");
		expect(settings.modes.properties.alias).toBe("properties");
	});
});

describe("統合されたすべてのモード", () => {
	it("いずれかの古いスコープが有効になっている場合は、そのエイリアスを保持し、モードを有効のままにします", () => {
		const settings = mergeSettings({
			schemaVersion: 21,
			modes: {
				everything: { alias: "ev", enabled: false },
				"everything-all": { alias: "all", enabled: true },
			},
		});
		expect(settings.modes.everything).toEqual({ alias: "ev", enabled: true });
		expect(settings.modes).not.toHaveProperty("everything-all");
	});

	it("移行後に無効化されたマージ モードを保持し、必要に応じて古い全ファイル エイリアスを使用します。", () => {
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION,
				modes: { everything: { alias: "ev", enabled: false } },
			}).modes.everything.enabled,
		).toBe(false);
		expect(
			mergeSettings({
				modes: { "everything-all": { alias: "all", enabled: true } },
			}).modes.everything.alias,
		).toBe("all");
	});
});

describe("終了後にホームに戻る", () => {
	it("古い「最後の入力を記憶」スイッチを時刻に変更し、新規インストールのデフォルトを維持します", () => {
		expect(mergeSettings({ rememberLastInput: false }).home).toEqual({
			returnAfterSeconds: 0,
		});
		expect(mergeSettings({ rememberLastInput: true }).home).toEqual({
			returnAfterSeconds: 90,
		});
		expect(mergeSettings(undefined).home).toEqual({ returnAfterSeconds: 90 });
	});

	it("保存された時間を古いスイッチに保持し、スイッチをドロップします", () => {
		const settings = mergeSettings({
			rememberLastInput: false,
			home: { returnAfterSeconds: 60 },
		});
		expect(settings.home.returnAfterSeconds).toBe(60);
		expect(settings).not.toHaveProperty("rememberLastInput");
	});

	it("古いランチャー キーの下に保存されている時間を読み取り、そのキーをドロップします", () => {
		const settings = mergeSettings({ launcher: { popToRootAfterSeconds: 30 } });
		expect(settings.home.returnAfterSeconds).toBe(30);
		expect(settings).not.toHaveProperty("launcher");
	});
});

describe("監査設定", () => {
	it("デフォルトでは孤立したファイルになります", () => {
		expect(mergeSettings({}).audit).toEqual(DEFAULT_SETTINGS.audit);
	});

	it("保存された種類を保持し、削除されたオプションを削除します", () => {
		const settings = mergeSettings({
			audit: {
				kind: "empty-files",
				excludedFolders: ["Archive"],
				excludedTags: ["draft"],
				excludedExtensions: ["csv"],
				excludeDailyNotesAndTemplates: false,
				mocOnlyAsEmpty: true,
				archiveFolder: "Archive/audit",
			},
		});
		expect(settings.audit).toEqual({ kind: "empty-files" });
		expect(mergeSettings({ audit: { kind: "unknown-kind" } }).audit.kind).toBe(
			"orphaned-files",
		);
	});
});

describe("監査モードのエイリアス", () => {
	it("`a` を使用するか、別のモードがすでに `a` を使用している場合は `audit` に移動します", () => {
		expect(mergeSettings({}).modes.audit).toEqual({ alias: "a", enabled: true });
		expect(
			mergeSettings({ modes: { tabs: { alias: "a", enabled: true } } }).modes.audit.alias,
		).toBe("audit");
	});

	it("保存された種類を保持します", () => {
		expect(mergeSettings({ audit: { kind: "broken-links" } }).audit.kind).toBe("broken-links");
	});
});
