import { Notice, type App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalSearch } from "src/platform/obsidianInternals";
import { openTagSearch } from "src/tags/tagSearch";

vi.mock("obsidian", () => ({ Notice: vi.fn() }));
vi.mock("src/platform/obsidianInternals", () => ({ getGlobalSearch: vi.fn() }));

const app = {} as App;

beforeEach(() => {
	vi.mocked(Notice).mockClear();
	vi.mocked(getGlobalSearch).mockReset();
});

describe("タグ検索を開く", () => {
	it("タグのコアグローバル検索を開き、成功を報告します", () => {
		const openGlobalSearch = vi.fn();
		vi.mocked(getGlobalSearch).mockReturnValue({ openGlobalSearch });
		expect(openTagSearch(app, "project", true)).toBe(true);
		expect(openGlobalSearch).toHaveBeenCalledExactlyOnceWith("tag:#project", true);
	});

	it("グローバル検索コアがオフのときに失敗を通知および報告します", () => {
		vi.mocked(getGlobalSearch).mockReturnValue(undefined);
		expect(openTagSearch(app, "project", true)).toBe(false);
		expect(Notice).toHaveBeenCalledTimes(1);
	});
});
