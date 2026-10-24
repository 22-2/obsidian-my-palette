import { describe, expect, it } from "vitest";
import {
	changeCount,
	directChanges,
	isCheckedRow,
	pendingChanges,
	type ChangeRow,
} from "src/ui/multiSelectChanges";

const fresh: ChangeRow<string> = { key: "a", value: "a" };
const applied: ChangeRow<string> = { key: "b", value: "b", applied: true };

describe("行のチェック状態判定", () => {
	it("適用されていない行のチェックを外し、適用された行のチェックをオンにして開始します。", () => {
		expect(isCheckedRow(fresh, new Set())).toBe(false);
		expect(isCheckedRow(applied, new Set())).toBe(true);
	});

	it("切り替え時に行を反転します", () => {
		expect(isCheckedRow(fresh, new Set(["a"]))).toBe(true);
		expect(isCheckedRow(applied, new Set(["b"]))).toBe(false);
	});
});

describe("保留中の変更", () => {
	it("チェックされた未適用の行を追加し、チェックされていない適用された行を削除します", () => {
		const changes = pendingChanges([fresh, applied], new Set(["a", "b"]));
		expect(changes).toEqual({ add: ["a"], remove: ["b"] });
	});

	it("強調表示されているだけの適用された行を無視します", () => {
		expect(pendingChanges([fresh, applied], new Set())).toEqual({ add: ["a"], remove: [] });
	});
});

describe("直接変更", () => {
	it("ユーザーが操作した行を追加と削除に分割します", () => {
		expect(directChanges([fresh, applied])).toEqual({ add: ["a"], remove: ["b"] });
		expect(directChanges([applied])).toEqual({ add: [], remove: ["b"] });
	});
});

describe("変更数", () => {
	it("加算と削除を一緒にカウントします", () => {
		expect(changeCount({ add: ["a", "c"], remove: ["b"] })).toBe(3);
		expect(changeCount({ add: [], remove: [] })).toBe(0);
	});
});
