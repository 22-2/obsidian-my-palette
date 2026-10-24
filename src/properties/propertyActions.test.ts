import type { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { editPropertyResult } from "src/properties/propertyActions";
import { editPropertyValue } from "src/properties/propertyInputSelector";
import { editListProperty } from "src/properties/propertyValueSelector";

const notices = vi.hoisted(() => [] as string[]);
const insertTagsMock = vi.hoisted(() => vi.fn());
const selectedKinds = vi.hoisted(() => [] as Array<string | null>);

vi.mock("src/ui/selectionModal", () => ({
	SelectionModal: class {
		constructor(private readonly props: { items: Array<{ kind: string }> }) {}
		open(): void {
			const kind = selectedKinds.shift();
			const item = this.props.items.find((item) => item.kind === kind);
			if (item) void this.onItemActivated(item);
			else this.close();
		}
		close(): void {
			this.onSelectionModalClose();
		}
		protected async onItemActivated(_item: { kind: string }): Promise<void> {}
		protected onSelectionModalClose(): void {}
	},
}));

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));
vi.mock("src/tags/insertTags", () => ({ insertTags: insertTagsMock }));
vi.mock("src/properties/propertyValueSelector", () => ({
	editListProperty: vi.fn(),
	vaultValuesOf: vi.fn(() => []),
}));
vi.mock("src/properties/propertyInputSelector", () => ({ editPropertyValue: vi.fn() }));

const file = { path: "note.md", basename: "note" } as unknown as TFile;
const second = { path: "second.md", basename: "second" } as unknown as TFile;

function plugin(frontmatter: Record<string, unknown>, options: { fail?: boolean } = {}) {
	const written: Record<string, unknown> = {};
	const app = {
		vault: {
			getFileByPath: (path: string) =>
				path === "note.md" ? file : path === "second.md" ? second : null,
		},
		metadataCache: { getFileCache: () => ({ frontmatter }) },
		fileManager: {
			processFrontMatter: async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				if (options.fail) throw new Error("YAML");
				fn(written);
			},
		},
	};
	return { plugin: { app } as unknown as MyPalettePlugin, written };
}

function row(overrides: Partial<PropertyResult>): PropertyResult {
	return {
		id: "property:x",
		mode: "property",
		primary: "x",
		secondary: "",
		icon: "square-check",
		key: "x",
		kind: "checkbox",
		section: "このノート",
		inNote: true,
		sourcePath: "note.md",
		...overrides,
	};
}

beforeEach(() => {
	notices.length = 0;
	selectedKinds.length = 0;
	insertTagsMock.mockReset();
	vi.mocked(editPropertyValue).mockReset().mockResolvedValue("done");
	vi.mocked(editListProperty).mockReset().mockResolvedValue("done");
});

describe("プロパティ結果の編集", () => {
	it("欠落しているチェックボックスを true に設定します", async () => {
		const { plugin: p, written } = plugin({});
		const outcome = await editPropertyResult(p, row({ key: "done" }));
		expect(outcome).toBe("stay");
		expect(written).toEqual({ done: true });
		expect(notices).toEqual(["note の done を true に設定しました。"]);
	});

	it("true のチェックボックスを false に切り替え、false のチェックボックスを true に切り替えます。", async () => {
		const first = plugin({ done: true });
		await editPropertyResult(first.plugin, row({ key: "done" }));
		expect(first.written).toEqual({ done: false });
		const second = plugin({ done: false });
		await editPropertyResult(second.plugin, row({ key: "done" }));
		expect(second.written).toEqual({ done: true });
	});

	it("リストを変更せずに書き込み失敗を報告します", async () => {
		const { plugin: p } = plugin({}, { fail: true });
		const outcome = await editPropertyResult(p, row({ key: "done" }));
		expect(outcome).toBe("stay");
		expect(notices).toEqual([
			"note のプロパティを更新できませんでした。コンソールを確認してください。",
		]);
	});

	it("タグの挿入がキャンセルされたときにパレットを保持します", async () => {
		const { plugin: p } = plugin({});
		insertTagsMock.mockResolvedValue(false);
		expect(await editPropertyResult(p, row({ key: "tags", kind: "tags" }))).toBe("stay");
	});

	it("タグキーのタグ挿入を開き、パレットを閉じます", async () => {
		const { plugin: p } = plugin({});
		insertTagsMock.mockResolvedValue(true);
		const outcome = await editPropertyResult(p, row({ key: "tags", kind: "tags" }));
		expect(outcome).toBe("close");
		expect(insertTagsMock).toHaveBeenCalledWith(p, [file]);
	});

	it("テキスト、数値、日付、日時行の値入力を開いて閉じます。", async () => {
		const { plugin: p } = plugin({});
		for (const kind of ["text", "number", "date", "datetime"] as const) {
			vi.mocked(editPropertyValue).mockClear();
			const outcome = await editPropertyResult(p, row({ key: "due", kind }));
			expect(outcome).toBe("close");
			expect(editPropertyValue).toHaveBeenCalledWith(p, file, "due", kind);
		}
	});

	it("リスト行のリストセレクターを開いて閉じます", async () => {
		const { plugin: p } = plugin({});
		const outcome = await editPropertyResult(p, row({ key: "aliases", kind: "list" }));
		expect(outcome).toBe("close");
		expect(editListProperty).toHaveBeenCalledWith(p, [file], "aliases");
	});

	it("ネストされた値がソース モードで編集されることをユーザーに伝えます", async () => {
		const { plugin: p } = plugin({});
		await editPropertyResult(p, row({ kind: "unsupported" }));
		expect(notices).toEqual(["このプロパティはソースモードで編集してください。"]);
	});

	it.each(["text", "number", "date", "datetime", "list"] as const)(
		"returns to the property list when the %s editor is dismissed",
		async (kind) => {
			const { plugin: p, written } = plugin({});
			vi.mocked(editPropertyValue).mockResolvedValue("dismissed");
			vi.mocked(editListProperty).mockResolvedValue("dismissed");
			const outcome = await editPropertyResult(p, row({ key: "due", kind }));
			expect(outcome).toBe("stay");
			expect(written).toEqual({});
		},
	);

	it.each(["text", "list"] as const)(
		"returns to type selection when a new %s editor is dismissed",
		async (kind) => {
			const { plugin: p, written } = plugin({});
			selectedKinds.push(kind, "number");
			if (kind === "list") vi.mocked(editListProperty).mockResolvedValueOnce("dismissed");
			else vi.mocked(editPropertyValue).mockResolvedValueOnce("dismissed");
			const outcome = await editPropertyResult(p, row({ key: "due", kind: "new" }));
			expect(outcome).toBe("close");
			expect(editPropertyValue).toHaveBeenLastCalledWith(p, file, "due", "number");
			expect(selectedKinds).toEqual([]);
			expect(written).toEqual({});
		},
	);

	it("エディターの後にタイプの選択が解除されると、プロパティ リストに戻ります。", async () => {
		const { plugin: p, written } = plugin({});
		selectedKinds.push("text", null);
		vi.mocked(editPropertyValue).mockResolvedValueOnce("dismissed");
		expect(await editPropertyResult(p, row({ key: "due", kind: "new" }))).toBe("stay");
		expect(selectedKinds).toEqual([]);
		expect(written).toEqual({});
	});

	it("ソースノートの欠落を報告します", async () => {
		const { plugin: p } = plugin({});
		const outcome = await editPropertyResult(p, row({ sourcePath: "gone.md" }));
		expect(outcome).toBe("stay");
		expect(notices).toEqual(["このプロパティのノートは存在しません。"]);
	});

	describe("複数の音符にまたがる行", () => {
		const many = { sourcePaths: ["note.md", "second.md"] };

		it("すべての音符でリストセレクターを開きます", async () => {
			const { plugin: p } = plugin({});
			const outcome = await editPropertyResult(
				p,
				row({ key: "topic", kind: "list", ...many }),
			);
			expect(outcome).toBe("close");
			expect(editListProperty).toHaveBeenCalledWith(p, [file, second], "topic");
		});

		it("すべての音符にタグの挿入を開始します", async () => {
			const { plugin: p } = plugin({});
			insertTagsMock.mockResolvedValue(true);
			await editPropertyResult(p, row({ key: "tags", kind: "tags", ...many }));
			expect(insertTagsMock).toHaveBeenCalledWith(p, [file, second]);
		});

		it.each(["text", "number", "date", "datetime", "checkbox"] as const)(
			"does not set a %s value on several notes yet",
			async (kind) => {
				const { plugin: p, written } = plugin({});
				const outcome = await editPropertyResult(p, row({ key: "due", kind, ...many }));
				expect(outcome).toBe("stay");
				expect(written).toEqual({});
				expect(notices).toEqual([
					"複数のノートに due を設定する操作は、まだ対応していません。",
				]);
				expect(editPropertyValue).not.toHaveBeenCalled();
			},
		);

		it("新しいキーのリスト タイプのみを提供し、すべてのノートを編集します", async () => {
			const { plugin: p } = plugin({});
			selectedKinds.push("list");
			const outcome = await editPropertyResult(
				p,
				row({ key: "topic", kind: "new", ...many }),
			);
			expect(outcome).toBe("close");
			expect(editListProperty).toHaveBeenCalledWith(p, [file, second], "topic");
		});

		it("存在しないメモをスキップします", async () => {
			const { plugin: p } = plugin({});
			await editPropertyResult(
				p,
				row({ key: "topic", kind: "list", sourcePaths: ["note.md", "gone.md"] }),
			);
			expect(editListProperty).toHaveBeenCalledWith(p, [file], "topic");
		});
	});
});
