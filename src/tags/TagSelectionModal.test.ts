import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";
import { installObsidianDom, Menu } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const choices: TagChoice[] = [
	{ tag: "alpha", count: 2, registered: false, present: false, reason: "recent" },
	{ tag: "beta", count: 1, registered: false, present: true },
	{ tag: "mine", count: 5, registered: true, present: true },
];

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
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

async function open() {
	const modal = new TagSelectionModal({} as App, choices, { label: "Target: note.md", count: 1 });
	const result = modal.openAndWait();
	await Promise.resolve();
	const labels = () =>
		[...modal.modalEl.querySelectorAll(".suggestion-item")].map((row) => row.textContent);
	const key = (name: string, options: KeyboardEventInit = {}) =>
		modal.inputEl.dispatchEvent(
			new KeyboardEvent("keydown", { key: name, bubbles: true, ...options }),
		);
	const type = async (value: string) => {
		modal.inputEl.value = value;
		modal.inputEl.dispatchEvent(new Event("input"));
		await Promise.resolve();
	};
	return { modal, result, labels, key, type };
}

describe("TagSelectionModal", () => {
	it("toggles tags without closing and resolves them from the confirm row", async () => {
		const f = await open();
		f.key("Enter");
		await Promise.resolve();
		// The confirm row is inserted above, yet the cursor stays on the toggled tag.
		expect(f.labels()[0]).toBe("Add #alpha");
		expect(f.modal.modalEl.querySelector(".my-palette-tag-select__action")?.textContent).toBe(
			"Add ",
		);
		f.key("ArrowDown");
		f.key("Enter");
		await Promise.resolve();
		expect(f.labels()[0]).toBe("Add #alpha #beta");
		f.key("ArrowUp");
		f.key("ArrowUp");
		f.key("Enter");
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["alpha", "beta"] });
	});

	it("adds a typed new tag and confirms with Ctrl+Enter", async () => {
		const f = await open();
		await f.type("#fresh");
		f.key("Enter");
		await Promise.resolve();
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["fresh"] });
	});

	it("ignores registered tags and resolves null when cancelled", async () => {
		const f = await open();
		await f.type("mine");
		f.key("Enter");
		await Promise.resolve();
		// Ctrl+Enter without any selection must not confirm an empty insertion.
		f.key("Enter", { ctrlKey: true });
		expect(f.labels().some((label) => label?.startsWith("Add"))).toBe(false);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});
});

describe("TagSelectionModal context menu", () => {
	const rightClick = (row: Element) =>
		row.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
		);
	const rowFor = (modal: TagSelectionModal, label: string) =>
		[...modal.modalEl.querySelectorAll(".suggestion-item")].find((row) =>
			row.textContent?.startsWith(label),
		)!;
	const titles = () => Menu.lastShown?.items.map(({ title }) => title);

	beforeEach(() => {
		Menu.lastShown = undefined;
	});

	it("inserts only the clicked tag immediately, discarding toggled tags", async () => {
		const f = await open();
		f.key("Enter");
		await Promise.resolve();
		rightClick(rowFor(f.modal, "#beta"));
		expect(titles()).toEqual(["Insert #beta now", "Remove #beta from note"]);
		Menu.lastShown!.items[0].click();
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["beta"] });
	});

	it("removes a registered tag from the target", async () => {
		const f = await open();
		rightClick(rowFor(f.modal, "#mine"));
		expect(titles()).toEqual(["Remove #mine from note"]);
		Menu.lastShown!.items[0].click();
		await expect(f.result).resolves.toEqual({ action: "remove", tags: ["mine"] });
	});

	it("shows no menu for the confirm row", async () => {
		const f = await open();
		f.key("Enter");
		await Promise.resolve();
		rightClick(rowFor(f.modal, "Add "));
		expect(Menu.lastShown).toBeUndefined();
	});
});
