import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/settings/model";
import { IntegrationAvailability } from "src/app/integrationAvailability";
import {
	PaletteSearchSession,
	palettePlaceholder,
	paletteRouteChrome,
	paletteSectionOf,
} from "src/palette/PaletteSearchSession";
import type { FileResult } from "src/palette/results";

async function host() {
	const settings = structuredClone(DEFAULT_SETTINGS);
	const integrationAvailability = new IntegrationAvailability(
		() => settings,
		async () => ({ ok: false, message: "Not configured" }),
		() => false,
	);
	await integrationAvailability.refresh();
	const file: FileResult = {
		id: "file:Example.md",
		mode: "file",
		primary: "Example",
		secondary: "Example.md",
		icon: "file",
		vaultPath: "Example.md",
	};
	const recordSearch = vi.fn();
	const plugin = {
		settings,
		integrationAvailability,
		providers: { file: { search: async () => [file] } },
		recordSearch,
	} as unknown as MyPalettePlugin;
	return { plugin, file, recordSearch };
}

describe("ホームセクション", () => {
	it("すべてのモードが無効になっている場合に、設定セクションなしでファイルのみをリストします。", async () => {
		const { plugin, file } = await host();
		for (const mode of Object.values(plugin.settings.modes)) mode.enabled = false;
		const session = new PaletteSearchSession(plugin, { modeEntries: true });
		expect(await session.search("settings")).toEqual([file]);
		expect(paletteSectionOf(session.current, file)).toBeUndefined();
		session.dispose();
	});
});

describe("PaletteSearchSession 検索ライフサイクル", () => {
	it("エイリアスからモードに入り、接頭辞付きの入力を記憶し、履歴を一度コミットします", async () => {
		const { plugin, recordSearch } = await host();
		plugin.providers.command = { search: vi.fn().mockResolvedValue([]) };
		const session = new PaletteSearchSession(plugin, { modeEntries: true });
		await session.search("> build");
		expect(session.current.mode).toBe("command");
		expect(session.input).toBe("build");
		expect(session.prefixedInput).toBe("> build");
		expect(session.getRecordableSearch()?.category).toBe("command");
		session.commitCurrentSearch();
		session.commitCurrentSearch();
		expect(recordSearch).toHaveBeenCalledTimes(1);
		expect(session.returnToHome()).toBe(">");
		session.dispose();
	});

	it("無視されたスコープ、ソース ファイル、およびルート クエリをプロバイダーに渡します", async () => {
		const { plugin } = await host();
		const search = vi.fn().mockResolvedValue([]);
		plugin.providers.command = { search };
		const sourceFile = { path: "source.md" } as never;
		const session = new PaletteSearchSession(plugin, { sourceFile, includeIgnored: true });
		session.enterMode("commands");
		session.setIgnoredScope(true);
		await session.search("needle");
		expect(search).toHaveBeenCalledWith(
			expect.objectContaining({ query: "needle", sourceFile, includeIgnored: false }),
		);
		expect(session.getSearchHistoryContext("needle").category).toBe("command");
		session.dispose();
	});

	it("更新中に古い行を保持し、古いプロバイダーの結果を削除します", async () => {
		const { plugin, file } = await host();
		let finish!: (rows: FileResult[]) => void;
		plugin.providers.file = {
			search: vi
				.fn()
				.mockImplementationOnce(async () => [file])
				.mockImplementationOnce(
					() =>
						new Promise((resolve) => {
							finish = resolve;
						}),
				),
		};
		const session = new PaletteSearchSession(plugin);
		await session.search("first");
		const refresh = session.search("first", { keepResults: true });
		expect(session.current.results).toContain(file);
		session.dispose();
		finish([file]);
		expect(await refresh).toEqual([]);
	});

	it("プロバイダーの障害を報告し、すべてが利用不可であることをマークします", async () => {
		const { plugin } = await host();
		const failure = new Error("offline");
		plugin.settings.everything.debounceMs = 0;
		plugin.providers.everything = { search: vi.fn().mockRejectedValue(failure) };
		const session = new PaletteSearchSession(plugin);
		session.enterMode("everything");
		await session.search("query");
		expect(session.current.error).toBe("offline");
		expect(session.current.results).toEqual([]);
		expect(plugin.integrationAvailability.current.everything).toBe(false);
		session.dispose();
	});

	it("検索の開始からプロバイダーが応答するまでレポートを読み込みます", async () => {
		const { plugin, file } = await host();
		let answer!: (results: FileResult[]) => void;
		plugin.providers.file = {
			search: () => new Promise<FileResult[]>((resolve) => (answer = resolve)),
		};
		const session = new PaletteSearchSession(plugin);
		const pending = session.search("needle");
		expect(session.current.loading).toBe(true);
		answer([file]);
		await pending;
		expect(session.current.loading).toBe(false);
		session.dispose();
	});

	it("プロバイダーが失敗したときに読み込みをクリアします", async () => {
		const { plugin } = await host();
		plugin.providers.file = { search: vi.fn().mockRejectedValue(new Error("offline")) };
		const session = new PaletteSearchSession(plugin);
		await session.search("needle");
		expect(session.current.error).toBe("offline");
		expect(session.current.loading).toBe(false);
		session.dispose();
	});

	it("空白入力の場合はレコードを返さず、破棄後は検索しません。", async () => {
		const { plugin } = await host();
		const session = new PaletteSearchSession(plugin);
		expect(session.getRecordableSearch("  ")).toBeUndefined();
		session.dispose();
		expect(await session.search("after close")).toEqual([]);
	});

	it("ソースが変更された場合にのみソース依存モードを更新します。", async () => {
		const { plugin } = await host();
		const search = vi.fn().mockResolvedValue([]);
		plugin.providers.link = { search };
		const firstFile = { path: "one.md" } as never;
		const session = new PaletteSearchSession(plugin, {
			fixedMode: "link",
			sourceFile: firstFile,
		});
		session.setSourceFile(firstFile);
		session.setSourceFile({ path: "two.md" } as never);
		await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
		expect(search.mock.calls[0]?.[0]).toMatchObject({
			mode: "link",
			sourceFile: { path: "two.md" },
		});
		session.dispose();
	});
});

describe("パレットルートのプレゼンテーション", () => {
	it("モードチップとモード固有のプレースホルダーを使用します", () => {
		expect(
			paletteRouteChrome(
				{ route: { kind: "mode", modeId: "commands" }, mode: "command" },
				">",
				false,
			),
		).toEqual({
			placeholder: "コマンドを検索",
			chip: { icon: "square-terminal", label: ">", title: "コマンド" },
		});
		expect(palettePlaceholder("link")).toBe("アクティブなファイルのリンクを検索");
		expect(palettePlaceholder("backlink")).toBe("アクティブなファイルへの被リンクを検索");
		expect(palettePlaceholder("bookmark")).toBe("ブックマークを検索");
		expect(palettePlaceholder("smart")).toBe("Smart Connections を検索");
		expect(palettePlaceholder("tab")).toBe("開いているタブを検索");
		expect(palettePlaceholder("plugin")).toBe("インストール済みのプラグインを検索");
		expect(palettePlaceholder("snippet")).toBe("CSS スニペットを検索");
		expect(palettePlaceholder("property")).toBe("アクティブなノートのプロパティを検索");
		expect(palettePlaceholder("file")).toBe("ファイルを検索");
	});

	it("混合ホームリストのみセクション見出しを表示します", () => {
		const file: FileResult = {
			id: "file:x",
			mode: "file",
			primary: "x",
			secondary: "x",
			icon: "file",
			vaultPath: "x.md",
		};
		const mode = {
			id: "mode:notes",
			mode: "mode-entry",
			modeId: "notes",
			alias: "n",
			primary: "Notes",
			secondary: "Obsidian",
			icon: "files",
		} as const;
		const state = { route: { kind: "home" as const }, results: [mode] };
		expect(paletteSectionOf(state, mode)).toBe("モード");
		expect(paletteSectionOf(state, file)).toBe("ファイル");
		expect(paletteSectionOf(undefined, file)).toBeUndefined();
		expect(
			paletteSectionOf({ route: { kind: "mode", modeId: "notes" }, results: [mode] }, file),
		).toBeUndefined();
		expect(
			paletteRouteChrome({ route: { kind: "home" }, mode: "file" }, undefined, true),
		).toEqual({ placeholder: "ファイルを検索、またはモードを選択" });
	});
});
