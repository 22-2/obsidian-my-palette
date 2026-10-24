import { describe, expect, it } from "vitest";
import {
	PaletteTableModel,
	normalizePaletteTableState,
	type PaletteTableRow,
} from "src/palette/table/paletteTableModel";

function row(
	name: string,
	modified?: number,
	prior?: number,
	path = `${name}.md`,
): PaletteTableRow {
	return {
		result: {
			id: path,
			mode: "file",
			primary: name,
			secondary: path,
			vaultPath: path,
			icon: "file",
		},
		name,
		path,
		modified,
		prior,
	};
}

function names(model: PaletteTableModel): string[] {
	return model.sortedRows().map((item) => item.name);
}

describe("パレットテーブルモデル", () => {
	it("元の表示制限を超えたレコードを含む、すべての一致をソート順に返します。", () => {
		const model = new PaletteTableModel([{ id: "modified", desc: true }]);
		model.setRows(Array.from({ length: 120 }, (_, index) => row(`Note ${index}`, index)));
		expect(names(model)).toHaveLength(120);
		expect(names(model).at(0)).toBe("Note 119");
		expect(names(model).at(49)).toBe("Note 70");
		expect(names(model).at(-1)).toBe("Note 0");
	});

	it("複数の列の優先順位を使用する", () => {
		const model = new PaletteTableModel([
			{ id: "prior", desc: true },
			{ id: "modified", desc: true },
		]);
		model.setRows([row("High old", 10, 2), row("Low new", 30, 1), row("High new", 20, 2)]);
		expect(names(model)).toEqual(["High new", "High old", "Low new"]);
		expect(names(model)).toEqual(["High new", "High old", "Low new"]);
		expect(model.sorting).toEqual([
			{ id: "prior", desc: true },
			{ id: "modified", desc: true },
		]);
	});

	it.each([false, true])("places missing metadata last when descending is %s", (desc) => {
		const model = new PaletteTableModel([{ id: "prior", desc }]);
		model.setRows([row("Missing"), row("Zero", 0, 0), row("Negative", 0, -2)]);
		expect(names(model)).toEqual(
			desc ? ["Zero", "Negative", "Missing"] : ["Negative", "Zero", "Missing"],
		);
	});

	it("並べ替えがクリアされると検索ランキングを復元し、同順位の場合はそれを保持します", () => {
		const model = new PaletteTableModel([{ id: "prior", desc: true }]);
		model.setRows([row("Second", 5, 1), row("First", 5, 1)]);
		expect(names(model)).toEqual(["Second", "First"]);
		model.setSorting([{ id: "name", desc: false }]);
		expect(names(model)).toEqual(["First", "Second"]);
		model.setSorting([]);
		expect(names(model)).toEqual(["Second", "First"]);
	});

	it("修飾キーを使用したり、他の優先順位を置き換えたりせずに、ヘッダーのソートを追加および循環します。", () => {
		const model = new PaletteTableModel();
		model.setRows([row("Note 10", 1), row("Note 2", 2)]);
		model.toggleSorting("name");
		expect(names(model)).toEqual(["Note 2", "Note 10"]);
		model.toggleSorting("modified");
		expect(model.sorting).toEqual([
			{ id: "name", desc: false },
			{ id: "modified", desc: true },
		]);
		model.toggleSorting("name");
		expect(model.sorting).toEqual([
			{ id: "name", desc: true },
			{ id: "modified", desc: true },
		]);
		model.toggleSorting("name");
		expect(model.sorting).toEqual([{ id: "modified", desc: true }]);
		model.toggleSorting("modified");
		expect(model.sorting).toEqual([{ id: "modified", desc: false }]);
		model.toggleSorting("modified");
		expect(model.sorting).toEqual([]);
	});

	it("並べ替えの優先順位を変更せずに列をヘッダーのどちらかの側に移動します", () => {
		const model = new PaletteTableModel([{ id: "prior", desc: true }]);
		model.moveColumn("prior", "name", "before");
		expect(model.visibleColumns.map(({ id }) => id)).toEqual([
			"prior",
			"name",
			"path",
			"modified",
		]);
		model.moveColumn("name", "modified", "after");
		expect(model.visibleColumns.map(({ id }) => id)).toEqual([
			"prior",
			"path",
			"modified",
			"name",
		]);
		model.moveColumn("prior", "prior", "after");
		expect(model.columnLayout.columnOrder).toEqual(["prior", "path", "modified", "name"]);
		expect(model.sorting).toEqual([{ id: "prior", desc: true }]);
	});

	it("名前を表示し、並べ替えをアクティブにしたまま、非表示の列を保存された位置に復元します", () => {
		const model = new PaletteTableModel([{ id: "prior", desc: true }]);
		model.moveColumn("prior", "name", "before");
		model.toggleColumnVisibility("prior");
		model.toggleColumnVisibility("name");
		expect(model.visibleColumns.map(({ id }) => id)).toEqual(["name", "path", "modified"]);
		expect(model.sorting).toEqual([{ id: "prior", desc: true }]);
		const restored = new PaletteTableModel(model.sorting);
		restored.setColumnLayout(model.columnLayout);
		restored.toggleColumnVisibility("prior");
		expect(restored.visibleColumns.map(({ id }) => id)).toEqual([
			"prior",
			"name",
			"path",
			"modified",
		]);
		const saved = restored.columnLayout;
		saved.columnOrder.reverse();
		expect(restored.visibleColumns[0].id).toBe("prior");
	});

	it("元の配列を変更せずに、現在の並べ替えを新しい検索結果に再適用します。", () => {
		const model = new PaletteTableModel([{ id: "name", desc: false }]);
		const rows = [row("Zulu"), row("Alpha")];
		model.setRows(rows);
		expect(names(model)).toEqual(["Alpha", "Zulu"]);
		expect(rows.map((item) => item.name)).toEqual(["Zulu", "Alpha"]);
		model.setRows([row("Gamma"), row("Beta")]);
		expect(names(model)).toEqual(["Beta", "Gamma"]);
	});
});

describe("正規化PaletteTableState", () => {
	it("サポートされている優先順位を順番に復元し、不正な列、削除された列、重複した列を破棄します。", () => {
		expect(
			normalizePaletteTableState({
				displayMode: "table",
				sorting: [
					{ id: "prior", desc: true },
					{ id: "deleted", desc: false },
					null,
					"name",
					{ id: "name", desc: "false" },
					{ id: "prior", desc: false },
					{ id: "name", desc: false },
				],
			}),
		).toEqual({
			displayMode: "table",
			columnOrder: ["name", "path", "modified", "prior"],
			hiddenColumns: [],
			sorting: [
				{ id: "prior", desc: true },
				{ id: "name", desc: false },
			],
		});
	});

	it("検索ランキングを使用して古いワークスペース レイアウトをリスト モードに維持します", () => {
		expect(normalizePaletteTableState({})).toEqual({
			displayMode: "list",
			sorting: [],
			columnOrder: ["name", "path", "modified", "prior"],
			hiddenColumns: [],
		});
		expect(normalizePaletteTableState({ displayMode: "removed", sorting: {} })).toEqual({
			displayMode: "list",
			sorting: [],
			columnOrder: ["name", "path", "modified", "prior"],
			hiddenColumns: [],
		});
	});

	it("有効な保存順序を維持しながら、不正なレイアウトを正規化し、欠落している列を追加します", () => {
		expect(
			normalizePaletteTableState({
				columnOrder: ["prior", "removed", "name", "prior", null],
				hiddenColumns: ["name", "prior", "removed", "prior", null],
			}),
		).toMatchObject({
			columnOrder: ["prior", "name", "path", "modified"],
			hiddenColumns: ["prior"],
		});
		expect(
			normalizePaletteTableState({ columnOrder: {}, hiddenColumns: "path" }),
		).toMatchObject({
			columnOrder: ["name", "path", "modified", "prior"],
			hiddenColumns: [],
		});
	});
});

describe("列セット", () => {
	it("各セットの独自の列を表示し、各セットの並べ替えとレイアウトを維持します", () => {
		const model = new PaletteTableModel([{ id: "modified", desc: true }]);
		model.toggleColumnVisibility("prior");
		model.setColumnSet("broken-links");
		expect(model.visibleColumns.map(({ id, label }) => [id, label])).toEqual([
			["name", "リンク"],
			["linkedFrom", "リンク元"],
			["firstSource", "最初の出所"],
		]);
		expect(model.sorting).toEqual([]);
		model.toggleSorting("linkedFrom");
		// A column of another set is not sortable here.
		model.toggleSorting("prior");
		expect(model.sorting).toEqual([{ id: "linkedFrom", desc: true }]);

		model.setColumnSet("files");
		expect(model.sorting).toEqual([{ id: "modified", desc: true }]);
		expect(model.columnLayout.hiddenColumns).toEqual(["prior"]);
		model.setColumnSet("broken-links");
		expect(model.sorting).toEqual([{ id: "linkedFrom", desc: true }]);
	});

	it("最上位に設定されたファイルと、columnSets の下に表示されているセットを保存します。", () => {
		const model = new PaletteTableModel();
		expect(model.state).not.toHaveProperty("columnSets");
		model.setColumnSet("empty-folders");
		model.moveColumn("foldersInside", "name", "before");
		expect(model.state).toEqual({
			sorting: [],
			columnOrder: ["name", "path", "modified", "prior"],
			hiddenColumns: [],
			columnSets: {
				"empty-folders": {
					sorting: [],
					columnOrder: ["foldersInside", "name", "path"],
					hiddenColumns: [],
				},
			},
		});

		const restored = new PaletteTableModel();
		restored.setState(model.state);
		restored.setColumnSet("empty-folders");
		expect(restored.visibleColumns.map(({ id }) => id)).toEqual([
			"foldersInside",
			"name",
			"path",
		]);
	});

	it("保存されたセットを正規化し、セットにない列を削除します", () => {
		expect(
			normalizePaletteTableState({
				columnSets: {
					"orphaned-files": {
						sorting: [
							{ id: "size", desc: true },
							{ id: "prior", desc: true },
						],
						columnOrder: ["size", "prior"],
						hiddenColumns: ["modified", "linkedFrom"],
					},
					removed: { sorting: [] },
				},
			}).columnSets,
		).toEqual({
			"orphaned-files": {
				sorting: [{ id: "size", desc: true }],
				columnOrder: ["size", "name", "path", "modified"],
				hiddenColumns: ["modified"],
			},
		});
	});
});
