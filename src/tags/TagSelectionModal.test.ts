import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const choices: TagChoice[] = [
	{ tag: "alpha", count: 2, registered: false, reason: "recent" },
	{ tag: "beta", count: 1, registered: false },
	{ tag: "mine", count: 5, registered: true },
];

beforeEach(() => {
	const dom = new Window();
	for (const name of ["document", "Element", "HTMLElement", "Event", "KeyboardEvent"] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

async function open() {
	const modal = new TagSelectionModal({} as App, choices, "Target: note.md");
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
		f.key("ArrowDown");
		f.key("Enter");
		await Promise.resolve();
		expect(f.labels()[0]).toBe("Add #alpha #beta");
		f.key("ArrowUp");
		f.key("ArrowUp");
		f.key("Enter");
		await expect(f.result).resolves.toEqual(["alpha", "beta"]);
	});

	it("adds a typed new tag and confirms with Ctrl+Enter", async () => {
		const f = await open();
		await f.type("#fresh");
		f.key("Enter");
		await Promise.resolve();
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual(["fresh"]);
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
