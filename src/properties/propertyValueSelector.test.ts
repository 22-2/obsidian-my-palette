import { Notice, type App, type TFile } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { applyListChanges, PropertyValueModal } from "src/properties/propertyValueSelector";
import { installObsidianDom } from "src/ui/testing/obsidianDom";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: vi.fn(),
}));

const file = { path: "note.md", basename: "note" } as unknown as TFile;

function fakeApp(frontmatter: Record<string, unknown>, options: { fail?: boolean } = {}) {
	const written: Record<string, unknown> = { ...frontmatter };
	const app = {
		fileManager: {
			processFrontMatter: async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				if (options.fail) throw new Error("YAML");
				fn(written);
			},
		},
	} as unknown as App;
	return { app, written };
}

describe("applyListChanges", () => {
	it("appends added values after the kept ones", async () => {
		const { app, written } = fakeApp({ aliases: ["a", "b"] });
		const ok = await applyListChanges(app, file, "aliases", { add: ["c"], remove: ["a"] });
		expect(ok).toBe(true);
		expect(written.aliases).toEqual(["b", "c"]);
	});

	it("turns a single string into a list when values change", async () => {
		const { app, written } = fakeApp({ aliases: "a" });
		await applyListChanges(app, file, "aliases", { add: ["b"], remove: [] });
		expect(written.aliases).toEqual(["a", "b"]);
	});

	it("removes the key when the list becomes empty", async () => {
		const { app, written } = fakeApp({ cssclasses: ["x"] });
		await applyListChanges(app, file, "cssclasses", { add: [], remove: ["x"] });
		expect("cssclasses" in written).toBe(false);
	});

	it("reports a failed write and keeps the note as it was", async () => {
		vi.mocked(Notice).mockClear();
		const { app } = fakeApp({}, { fail: true });
		expect(await applyListChanges(app, file, "aliases", { add: ["a"], remove: [] })).toBe(
			false,
		);
		expect(vi.mocked(Notice)).toHaveBeenCalledExactlyOnceWith(
			"Could not update the properties of note. See the console.",
		);
	});
});

describe("PropertyValueModal", () => {
	beforeEach(() => {
		const dom = new Window();
		for (const name of [
			"document",
			"Element",
			"Node",
			"HTMLElement",
			"Event",
			"KeyboardEvent",
			"MouseEvent",
		] as const)
			vi.stubGlobal(name, dom[name]);
		vi.stubGlobal("window", dom);
		installObsidianDom();
	});
	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	const flush = async () => {
		for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
	};

	function open(current: string[], vault: string[]) {
		const plugin = createSelectorPlugin({} as App) as unknown as MyPalettePlugin;
		const modal = new PropertyValueModal(plugin, file, "aliases", current, vault);
		const result = modal.openAndWaitChanges();
		const rows = () => [...modal.modalEl.querySelectorAll<HTMLElement>(".suggestion-item")];
		const checked = () =>
			rows()
				.filter((row) => row.classList.contains("is-checked"))
				.map((row) => row.querySelector(".my-palette-suggestion__label")?.textContent);
		const key = (name: string, options: KeyboardEventInit = {}) =>
			modal.inputEl.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: name,
					bubbles: true,
					cancelable: true,
					...options,
				}),
			);
		const type = async (value: string) => {
			modal.inputEl.value = value;
			modal.inputEl.dispatchEvent(new Event("input"));
			await flush();
		};
		return { modal, result, rows, checked, key, type };
	}

	it("lists the note's values checked and the vault's values after them", async () => {
		const f = open(["a"], ["b", "c"]);
		await flush();
		expect(f.rows().map((row) => row.textContent)).toEqual([
			expect.stringContaining("b"),
			expect.stringContaining("c"),
			expect.stringContaining("a"),
		]);
		expect(f.checked()).toEqual(["a"]);
		f.modal.close();
	});

	it("adds a checked vault value with Ctrl+Enter", async () => {
		const f = open(["a"], ["b"]);
		await flush();
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["b"], remove: [] });
	});

	it("offers a typed value that no list has yet and adds it on Enter", async () => {
		const f = open(["a"], ["b"]);
		await f.type("zeta");
		expect(f.rows()[0].textContent).toContain("New value");
		f.key("Enter");
		await expect(f.result).resolves.toEqual({ add: ["zeta"], remove: [] });
	});

	it("removes an applied value on Enter", async () => {
		const f = open(["a"], ["b"]);
		await f.type("a");
		f.key("Enter");
		await expect(f.result).resolves.toEqual({ add: [], remove: ["a"] });
	});
});
