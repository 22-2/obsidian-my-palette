import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const choices: TagChoice[] = [
	{ tag: "alpha", count: 2, registered: false, reason: "recent" },
	{ tag: "beta", count: 1, registered: false, appliedCount: 1 },
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

const flush = async () => {
	for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

async function open() {
	const modal = new TagSelectionModal(
		{} as App,
		choices,
		"Target: note.md",
		1,
		async () => undefined,
	);
	const result = modal.openAndWait();
	await flush();
	const labels = () =>
		[...modal.modalEl.querySelectorAll(".suggestion-item")].map((row) => row.textContent);
	const key = (name: string, options: KeyboardEventInit = {}) =>
		modal.inputEl.dispatchEvent(
			new KeyboardEvent("keydown", { key: name, bubbles: true, ...options }),
		);
	const type = async (value: string) => {
		modal.inputEl.value = value;
		modal.inputEl.dispatchEvent(new Event("input"));
		await flush();
	};
	return { modal, result, labels, key, type };
}

describe("TagSelectionModal", () => {
	it("toggles tags without closing and resolves them from the confirm row", async () => {
		const f = await open();
		f.key("Enter");
		await flush();
		// The confirm row is inserted above, yet the cursor stays on the toggled tag.
		expect(f.labels()[0]).toBe("Add #alpha");
		expect(f.modal.modalEl.querySelector(".my-palette-multi-select__action")?.textContent).toBe(
			"Add ",
		);
		f.key("ArrowDown");
		f.key("Enter");
		await flush();
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
		await flush();
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual(["fresh"]);
	});

	it("ignores registered tags and resolves null when cancelled", async () => {
		const f = await open();
		await f.type("mine");
		f.key("Enter");
		await flush();
		// Ctrl+Enter without any selection must not confirm an empty insertion.
		f.key("Enter", { ctrlKey: true });
		expect(f.labels().some((label) => label?.startsWith("Add"))).toBe(false);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("badges partly applied tags yet keeps them selectable", async () => {
		const modal = new TagSelectionModal(
			{} as App,
			choices,
			"Targets: 2 notes",
			2,
			async () => true,
		);
		void modal.openAndWait();
		await flush();
		const rows = [...modal.modalEl.querySelectorAll(".suggestion-item")];
		expect(rows[1].textContent).toContain("On 1/2 notes");
		expect(rows[1].classList.contains("is-locked")).toBe(false);
		expect(rows.at(-1)?.classList.contains("is-locked")).toBe(true);
		modal.close();
	});
});
