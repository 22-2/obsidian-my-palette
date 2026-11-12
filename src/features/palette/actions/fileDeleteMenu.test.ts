import { TFile, type App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { PaletteResult } from "src/core/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { openConfirmPalette } from "src/ui/confirmPalette";
import { addFileDeleteMenuItem } from "src/features/palette/actions/fileDeleteMenu";

vi.mock("obsidian", () => ({
	Notice: vi.fn(),
	TFile: class {
		constructor(
			public path: string,
			public extension: string,
		) {}
		get name() {
			return this.path.split("/").pop();
		}
	},
}));
vi.mock("src/ui/confirmPalette", () => ({ openConfirmPalette: vi.fn() }));

const File = TFile as unknown as new (path: string, extension: string) => TFile;

function fixture(paths: string[], mode: PaletteResult["mode"] = "file") {
	const files = new Map(
		paths.map((path) => [path, new File(path, path.slice(path.lastIndexOf(".") + 1))]),
	);
	const app = {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
	} as unknown as App;
	const results = paths.map((vaultPath) => ({ mode, vaultPath })) as unknown as PaletteResult[];
	const items: { title: string; accessKey?: string; click: () => void }[] = [];
	const menu = {
		addItem: (configure: (item: unknown) => void) => {
			const entry = { title: "", click: () => {} } as (typeof items)[number];
			const item = {
				setTitle: (title: string) => ((entry.title = title), item),
				setIcon: () => item,
				setSearchTerms: () => item,
				setAccessKey: (key: string) => ((entry.accessKey = key), item),
				setWarning: () => item,
				onClick: (callback: () => void) => ((entry.click = callback), item),
			};
			configure(item);
			items.push(entry);
		},
	} as unknown as PaletteMenu;
	addFileDeleteMenuItem(app, menu, results);
	return items;
}

describe("ファイルの削除メニュー", () => {
	it("ノートだけなら「ノート」と呼ぶ", () => {
		expect(fixture(["a.md"]).map((item) => item.title)).toEqual(["ノートを削除"]);
		expect(fixture(["a.md", "b.md"]).map((item) => item.title)).toEqual([
			"選択ノートを削除 (2件)",
		]);
	});

	it(".base など、ノート以外のファイルも削除でき、「ファイル」と呼ぶ", () => {
		expect(fixture(["Sample.base"]).map((item) => item.title)).toEqual(["ファイルを削除"]);
		expect(fixture(["a.md", "board.canvas"]).map((item) => item.title)).toEqual([
			"選択ファイルを削除 (2件)",
		]);
	});

	it("Notes の結果以外には出さない", () => {
		expect(fixture(["Sample.base"], "tab")).toEqual([]);
	});

	it("押すと、ファイルの確認パレットを開く", () => {
		vi.mocked(openConfirmPalette).mockClear();
		const [item] = fixture(["notes/Sample.base"]);
		item.click();
		expect(vi.mocked(openConfirmPalette).mock.calls[0][1]).toMatchObject({
			title: "ファイルをゴミ箱に移動しますか",
			paragraphs: [expect.stringContaining("「Sample.base」")],
			action: "ゴミ箱に移動する",
		});
	});
});
