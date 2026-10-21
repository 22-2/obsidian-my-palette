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

describe("openTagSearch", () => {
	it("opens the core global search for the tag and reports success", () => {
		const openGlobalSearch = vi.fn();
		vi.mocked(getGlobalSearch).mockReturnValue({ openGlobalSearch });
		expect(openTagSearch(app, "project", true)).toBe(true);
		expect(openGlobalSearch).toHaveBeenCalledExactlyOnceWith("tag:#project", true);
	});

	it("notifies and reports failure when the global search core is off", () => {
		vi.mocked(getGlobalSearch).mockReturnValue(undefined);
		expect(openTagSearch(app, "project", true)).toBe(false);
		expect(Notice).toHaveBeenCalledTimes(1);
	});
});
