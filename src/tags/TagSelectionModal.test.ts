import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";
import { installObsidianDom, Menu } from "src/ui/testing/obsidianDom";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const choices: TagChoice[] = [
	{ tag: "alpha", count: 2, registered: false, reason: "recent" },
	{ tag: "beta", count: 1, registered: false, appliedCount: 1 },
	{ tag: "mine", count: 5, registered: true },
];

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
	Menu.last = undefined;
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

const flush = async () => {
	for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

async function open(targetCount = 1, plugin = createSelectorPlugin({} as App)) {
	const modal = new TagSelectionModal(
		plugin,
		choices,
		"Target: note.md",
		targetCount,
		async () => undefined,
	);
	const result = modal.openAndWait();
	await flush();
	const rows = () => [...modal.modalEl.querySelectorAll<HTMLElement>(".suggestion-item")];
	const labels = () => rows().map((row) => row.textContent);
	const checked = () =>
		rows()
			.filter((row) => row.classList.contains("is-checked"))
			.map((row) => row.querySelector(".my-palette-suggestion__label")?.textContent);
	const button = () => modal.modalEl.querySelector<HTMLElement>(".my-palette-checked-button")!;
	const key = (name: string, options: KeyboardEventInit = {}) =>
		modal.inputEl.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: name,
				bubbles: true,
				cancelable: true,
				...options,
			}),
		);
	const mouse = (target: Element, type: string, options: MouseEventInit = {}) =>
		target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
	const type = async (value: string) => {
		modal.inputEl.value = value;
		modal.inputEl.dispatchEvent(new Event("input"));
		await flush();
	};
	return { plugin, modal, result, rows, labels, checked, button, key, mouse, type };
}

describe("TagSelectionModal", () => {
	it("offers insertion and check actions in the shared action button", async () => {
		const f = await open();
		const actionButton = f.modal.modalEl.querySelector<HTMLElement>(
			".my-palette-options-button",
		)!;
		f.mouse(actionButton, "click");
		expect(Menu.last?.titles()).toEqual([
			"Actions",
			"Check",
			"Add 1 now",
			"Uncheck all",
			"Help",
			"Options",
			"Highlight search matches",
		]);
		Menu.last?.items.find(({ title }) => title === "Check")?.click();
		expect(f.checked()).toEqual(["#alpha"]);
		f.mouse(actionButton, "click");
		expect(Menu.last?.titles()).toContain("Add 1 checked");
		Menu.last?.items.find(({ title }) => title === "Add 1 checked")?.click();
		await expect(f.result).resolves.toEqual(["alpha"]);
	});

	it("restores tag history without discarding checks or inserting tags", async () => {
		const f = await open();
		await f.type("#fresh");
		f.key("ArrowUp");
		f.key(" ");
		f.key("f");
		await f.type("");
		f.key("r", { ctrlKey: true });
		f.key("Enter");
		await flush();
		expect(f.modal.inputEl.value).toBe("#fresh");
		expect(f.checked()).toEqual(["#fresh"]);
		expect(f.modal.modalEl.isConnected).toBe(true);
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual(["fresh"]);
	});

	it.each(["ArrowUp", "ArrowDown"])(
		"starts selection at the first row with %s",
		async (arrow) => {
			const f = await open();
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(true);
			f.key(arrow);
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(false);
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			f.key("ArrowDown");
			expect(f.rows()[1].classList.contains("is-active")).toBe(true);
			f.key("f");
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(true);
			f.key(arrow);
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			expect(f.rows()[1].classList.contains("is-selected")).toBe(false);
			f.key("Enter");
			await expect(f.result).resolves.toEqual(["alpha"]);
		},
	);

	it("allows Space and f in input mode, then uses them as selection commands", async () => {
		const f = await open();
		expect(f.modal.inputEl.readOnly).toBe(false);
		expect(f.key(" ")).toBe(true);
		expect(f.key("f")).toBe(true);
		await f.type("alpha");
		f.key("ArrowUp", { isComposing: true });
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.key("ArrowUp");
		expect(f.modal.inputEl.readOnly).toBe(true);
		expect(f.modal.modalEl.textContent).toContain("Selection · ↑/f: input");
		f.key(" ", { isComposing: true });
		expect(f.checked()).toEqual([]);
		expect(f.key(" ")).toBe(false);
		expect(f.checked()).toEqual(["#alpha"]);
		f.key(" ", { repeat: true });
		expect(f.checked()).toEqual(["#alpha"]);
		expect(f.key("f")).toBe(false);
		expect(f.modal.inputEl.readOnly).toBe(false);
		expect(f.modal.inputEl.value).toBe("alpha");
		expect(f.modal.modalEl.textContent).toContain("Input · ↑/↓: select");
		f.key("ArrowDown");
		f.mouse(f.modal.inputEl, "mousedown");
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.modal.close();
	});

	it("starts in input mode again when reopened", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.modal.close();
		f.modal.open();
		await flush();
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.key("ArrowUp");
		f.key(" ");
		expect(f.checked()).toEqual(["#alpha"]);
		f.modal.close();
	});

	it("checks tags without closing and runs the checked ones with Ctrl+Enter", async () => {
		const f = await open();
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		// There is no confirm row; the cursor stays on the checked tag.
		expect(f.labels()[0]).toContain("#alpha");
		expect(f.checked()).toEqual(["#alpha"]);
		f.key("ArrowDown");
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta"]);
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual(["alpha", "beta"]);
	});

	it.each(["Enter", "NumpadEnter"])("immediately inserts a new tag with %s", async (code) => {
		const f = await open();
		await f.type("#fresh");
		f.key("Enter", { code });
		await expect(f.result).resolves.toEqual(["fresh"]);
	});

	it("ignores registered tags and runs nothing when nothing is checked", async () => {
		const f = await open();
		await f.type("mine");
		f.key("Enter");
		await flush();
		expect(f.checked()).toEqual([]);
		f.key("Enter", { ctrlKey: true });
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("checks every selected row at once and unchecks them on the next Space", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("ArrowDown", { shiftKey: true });
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta"]);
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual([]);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("checks only the clicked row when its check box is pressed", async () => {
		const f = await open();
		f.mouse(f.rows()[1].querySelector(".my-palette-suggestion__icon")!, "mousedown", {
			button: 0,
		});
		await flush();
		expect(f.checked()).toEqual(["#beta"]);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("badges partly applied tags yet keeps them selectable", async () => {
		const f = await open(2);
		expect(f.labels()[1]).toContain("On 1/2 notes");
		expect(f.rows()[1].classList.contains("is-locked")).toBe(false);
		expect(f.rows().at(-1)?.classList.contains("is-locked")).toBe(true);
		f.modal.close();
	});

	it("shows a check menu for one row and a bulk one for a multi-selection", async () => {
		const f = await open();
		f.mouse(f.rows()[0], "contextmenu", { button: 2 });
		expect(Menu.last?.titles()).toEqual(["Check", "Add 1 now"]);
		f.mouse(f.rows()[0], "mousedown");
		f.mouse(f.rows()[1], "mousedown", { shiftKey: true });
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		expect(Menu.last?.titles()).toContain("Check 2 selected");
		expect(Menu.last?.titles()).toContain("Add 2 now");
		Menu.last?.items.find(({ title }) => title === "Check 2 selected")?.click();
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta"]);
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		expect(Menu.last?.titles()).toEqual(["Uncheck 2 selected", "Add 2 checked", "Remove tag"]);
		f.modal.close();
	});

	it("closes an open menu when a row is pressed", async () => {
		const f = await open();
		f.mouse(f.rows()[0], "contextmenu", { button: 2 });
		const menu = Menu.last!;
		expect(menu.closed).toBe(false);
		f.mouse(f.rows()[1], "mousedown");
		expect(menu.closed).toBe(true);
		f.modal.close();
	});

	it("previews the checked tags from the input button and can run or clear them", async () => {
		const f = await open();
		expect(f.button().hidden).toBe(true);
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		expect(f.button().hidden).toBe(false);
		expect(f.button().textContent).toBe("1");
		f.mouse(f.button(), "click");
		expect(Menu.last?.titles()).toEqual(["Add 1 checked", "#alpha", "Uncheck all"]);
		Menu.last?.items.find(({ title }) => title === "Uncheck all")?.click();
		await flush();
		expect(f.checked()).toEqual([]);
		expect(f.button().hidden).toBe(true);
		f.key(" ");
		await flush();
		f.mouse(f.button(), "click");
		Menu.last?.items[0].click();
		await expect(f.result).resolves.toEqual(["alpha"]);
	});

	it("keeps a checked new tag listed after the input changes", async () => {
		const f = await open();
		await f.type("fresh");
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		f.key("f");
		await f.type("");
		expect(f.checked()).toEqual(["#fresh"]);
		// The check survives the new list, and the tag can still be run.
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual(["fresh"]);
	});

	it("runs the checked and highlighted tags together from the row menu", async () => {
		const f = await open();
		f.mouse(f.rows()[0].querySelector(".my-palette-suggestion__icon")!, "mousedown", {
			button: 0,
		});
		await flush();
		f.mouse(f.rows()[1], "mousedown");
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		Menu.last?.items.find(({ title }) => title === "Add 2 now")?.click();
		await expect(f.result).resolves.toEqual(["alpha", "beta"]);
	});
});
