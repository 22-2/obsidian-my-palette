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
	const footer = () =>
		modal.modalEl.querySelector(".my-palette-status-bar__text")?.textContent ?? "";
	return { modal, result, labels, key, type, footer };
}

describe("TagSelectionModal", () => {
	it("toggles checks in place and adds the checked tags with Ctrl+Enter", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("Enter");
		expect(f.footer()).toContain("1 checked");
		// The list is not rebuilt, so the cursor moves on from beta to mine (a no-op)
		// instead of jumping back to the first row and toggling alpha.
		f.key("ArrowDown");
		f.key("Enter");
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["beta"] });
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
		expect(f.footer()).not.toContain("checked");
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
	const mouseDown = (row: Element, options: MouseEventInit = {}) =>
		row.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...options }),
		);
	const titles = () => Menu.lastShown?.items.map(({ title }) => title);

	beforeEach(() => {
		Menu.lastShown = undefined;
	});

	it("inserts the checked tags together with the right-clicked one", async () => {
		const f = await open();
		f.key("Enter");
		rightClick(rowFor(f.modal, "#beta"));
		expect(titles()).toEqual(["Check #beta", "Insert 2 tags now", "Remove #beta from note"]);
		Menu.lastShown!.items[1].click();
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["alpha", "beta"] });
	});

	it("checks every highlighted row from the menu", async () => {
		const f = await open();
		mouseDown(rowFor(f.modal, "#alpha"));
		mouseDown(rowFor(f.modal, "#beta"), { shiftKey: true });
		rightClick(rowFor(f.modal, "#beta"));
		expect(titles()).toEqual(["Check 2 tags", "Insert 2 tags now", "Remove #beta from note"]);
		Menu.lastShown!.items[0].click();
		expect(f.footer()).toContain("2 checked");
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ action: "add", tags: ["alpha", "beta"] });
	});

	it("toggles every highlighted row with Enter", async () => {
		const f = await open();
		f.key("ArrowDown", { shiftKey: true });
		f.key("Enter");
		expect(f.footer()).toContain("2 checked");
		f.key("Enter");
		expect(f.footer()).not.toContain("checked");
	});

	it("removes a registered tag from the target", async () => {
		const f = await open();
		rightClick(rowFor(f.modal, "#mine"));
		expect(titles()).toEqual(["Remove #mine from note"]);
		Menu.lastShown!.items[0].click();
		await expect(f.result).resolves.toEqual({ action: "remove", tags: ["mine"] });
	});
});
