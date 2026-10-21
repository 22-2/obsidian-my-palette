import type { App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TagResult } from "src/palette/results";
import { populateTagMenu } from "src/tags/tagMenu";
import type { PaletteMenu } from "src/ui/paletteMenu";

const { modalArgs } = vi.hoisted(() => ({ modalArgs: [] as unknown[][] }));

vi.mock("obsidian", () => ({ Notice: vi.fn(), TFile: class {} }));
vi.mock("src/tags/TagRenameModal", () => ({
	TagRenameModal: class {
		constructor(...args: unknown[]) {
			modalArgs.push(args);
		}
		open() {}
	},
}));
vi.mock("src/shared/frontmatter", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/shared/frontmatter")>()),
	updateFrontmatter: vi.fn(
		async (_app: unknown, _file: unknown, _operation: string, update: (fm: object) => void) => {
			const frontmatter: { tags?: unknown } = { tags: ["keep"] };
			update(frontmatter);
			written.push(frontmatter);
			return true;
		},
	),
}));

const written: object[] = [];

function tag(name: string): TagResult {
	return {
		id: `tag:${name}`,
		mode: "tag",
		primary: `#${name}`,
		secondary: "1 回使用",
		icon: "hash",
		tagName: name,
		count: 1,
	};
}

/** メニューに加えられた項目を、タイトルとクリック操作で記録する。 */
function recordingMenu() {
	const items: { title?: string; click?: () => void }[] = [];
	const menu = {
		addItem(build: (item: unknown) => void) {
			const item: { title?: string; click?: () => void } = {};
			const builder = {
				setTitle(title: string) {
					item.title = title;
					return builder;
				},
				setIcon: () => builder,
				setSearchTerms: () => builder,
				onClick(handler: () => void) {
					item.click = handler;
					return builder;
				},
			};
			build(builder);
			items.push(item);
		},
		addSeparator: vi.fn(),
	};
	return { menu: menu as unknown as PaletteMenu, items };
}

const app = {
	workspace: { getActiveFile: () => ({ extension: "md", path: "note.md" }) },
} as unknown as App;

beforeEach(() => {
	modalArgs.length = 0;
	written.length = 0;
});

describe("populateTagMenu", () => {
	it("offers search, insert, and rename for one tag", () => {
		const { menu, items } = recordingMenu();
		const activate = vi.fn();
		populateTagMenu({ app, plugin: {} as never, menu, tags: [tag("project")], activate });
		expect(items.map((item) => item.title)).toEqual([
			expect.stringContaining("検索"),
			expect.stringContaining("現在のノート"),
			expect.stringContaining("変更"),
		]);
		items[0].click?.();
		expect(activate).toHaveBeenCalledWith(
			"primary",
			expect.objectContaining({ tagName: "project" }),
		);
	});

	it("drops search and rename when several tags are selected", () => {
		const { menu, items } = recordingMenu();
		populateTagMenu({
			app,
			plugin: {} as never,
			menu,
			tags: [tag("a"), tag("b")],
			activate: vi.fn(),
		});
		expect(items.map((item) => item.title)).toEqual([expect.stringContaining("現在のノート")]);
	});

	it("inserts the selected tags into the active note's frontmatter", async () => {
		const { menu, items } = recordingMenu();
		const onDone = vi.fn();
		populateTagMenu({
			app,
			plugin: {} as never,
			menu,
			tags: [tag("project")],
			activate: vi.fn(),
			onNoteActionDone: onDone,
		});
		items.find((item) => item.title?.includes("現在のノート"))?.click?.();
		await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
		expect(written).toEqual([{ tags: ["keep", "project"].sort() }]);
	});

	it("opens the rename modal for the single tag", () => {
		const { menu, items } = recordingMenu();
		populateTagMenu({
			app,
			plugin: {} as never,
			menu,
			tags: [tag("project")],
			activate: vi.fn(),
		});
		items.find((item) => item.title?.includes("変更"))?.click?.();
		expect(modalArgs).toEqual([[app, "project", undefined]]);
	});
});
