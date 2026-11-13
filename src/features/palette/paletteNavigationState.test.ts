import { describe, expect, it } from "vitest";
import { normalizeSavedNavigation } from "src/features/palette/paletteNavigationState";

describe("normalizeSavedNavigation", () => {
	const commit = {
		id: "git:test",
		mode: "git",
		kind: "commit",
		hash: "a".repeat(40),
		parents: [],
		primary: "件名",
		secondary: "",
		icon: "git-commit-horizontal",
	};
	const route = { kind: "mode", modeId: "git", page: { kind: "git-commit", commit } };
	const frames = [
		{
			route: { kind: "mode", modeId: "git" },
			input: "検索",
			view: { activeIndex: 2, scrollTop: 30, id: "git:test" },
		},
	];

	it("有効な階層と戻り先を復元する", () => {
		expect(normalizeSavedNavigation(route, frames)).toEqual({ route, navigation: frames });
	});

	it("不正なコミットや戻り先は復元しない", () => {
		expect(
			normalizeSavedNavigation(
				{ ...route, page: { ...route.page, commit: { ...commit, hash: "HEAD" } } },
				frames,
			),
		).toBeUndefined();
		expect(normalizeSavedNavigation(route, [])).toBeUndefined();
		expect(
			normalizeSavedNavigation(route, [
				{ ...frames[0], view: { activeIndex: 2, scrollTop: -1 } },
			]),
		).toBeUndefined();
	});
});
