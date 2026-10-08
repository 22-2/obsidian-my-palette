import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectorHistoryCategory } from "src/settings/model";
import { SelectionModal } from "src/ui/selectionModal";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";
import { installObsidianDom, Menu } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const cleanups: (() => void)[] = [];

class TestSelector extends SelectionModal<string> {
	readonly choose = vi.fn();
	constructor(
		plugin: ReturnType<typeof createSelectorPlugin>,
		category: SelectorHistoryCategory,
	) {
		super(
			{
				items: ["one", "two"],
				controls: {
					plugin,
					category,
					title: "Folder selection",
					description: "Choose a folder.",
					actionLabel: "Move to",
				},
			},
			plugin.app,
		);
	}
	protected override async onItemActivated(item: string) {
		this.choose(item);
		this.close();
	}
}

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"Node",
		"HTMLElement",
		"Event",
		"MouseEvent",
		"KeyboardEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	vi.useFakeTimers();
	dom.setTimeout = globalThis.setTimeout;
	dom.clearTimeout = globalThis.clearTimeout;
	installObsidianDom();
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const flush = async () => {
	for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

async function fixture(category: SelectorHistoryCategory = "folder-move") {
	const plugin = createSelectorPlugin({} as App);
	const modal = new TestSelector(plugin, category);
	modal.open();
	await flush();
	cleanups.push(() => modal.close());
	const key = (name: string, options: KeyboardEventInit = {}) => {
		const event = new KeyboardEvent("keydown", {
			key: name,
			bubbles: true,
			cancelable: true,
			...options,
		});
		modal.inputEl.dispatchEvent(event);
		return event;
	};
	const click = (selector: string) =>
		modal.modalEl
			.querySelector<HTMLElement>(selector)!
			.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	const type = async (input: string) => {
		modal.inputEl.value = input;
		modal.inputEl.dispatchEvent(new Event("input"));
		await flush();
	};
	return { plugin, modal, key, click, type };
}

describe("selector controls", () => {
	it.each(["tag-insertion", "moc-insertion", "folder-move"] as const)(
		"restores only %s history without activating a candidate",
		async (category) => {
			const f = await fixture(category);
			const input = category === "moc-insertion" ? "i old notes" : "one";
			f.plugin.recordSearch(input, category);
			f.plugin.recordSearch("unrelated", "file");
			for (const other of ["tag-insertion", "moc-insertion", "folder-move"] as const)
				if (other !== category) f.plugin.recordSearch("other selector", other);
			f.key("ArrowDown");
			f.key("r", { ctrlKey: true });
			expect(f.modal.inputEl.readOnly).toBe(false);
			expect(
				f.modal.modalEl.querySelectorAll(".my-palette-history-suggest__item"),
			).toHaveLength(1);
			expect(f.key("Enter", { isComposing: true }).defaultPrevented).toBe(false);
			f.key("Enter");
			await flush();
			expect(f.modal.inputEl.value).toBe(input);
			expect(f.modal.inputEl.readOnly).toBe(false);
			expect(f.modal.modalEl.isConnected).toBe(true);
			expect(f.modal.choose).not.toHaveBeenCalled();
			expect(f.plugin.getSearchHistorySuggestions("", category)[0].count).toBe(1);
		},
	);

	it("orders action then history buttons, removes them on close and recreates them once", async () => {
		const f = await fixture();
		const selector = ".my-palette-options-button, .my-palette-history-button";
		expect(
			[...f.modal.modalEl.querySelectorAll(selector)].map((button) => button.className),
		).toEqual([
			"clickable-icon my-palette-options-button",
			"clickable-icon my-palette-history-button",
		]);
		f.modal.close();
		expect(f.modal.modalEl.querySelectorAll(selector)).toHaveLength(0);
		f.modal.open();
		await flush();
		expect(f.modal.modalEl.querySelectorAll(selector)).toHaveLength(2);
		f.click(".my-palette-options-button");
		expect(Menu.last?.titles()).toEqual([
			"Actions",
			"Move to selected",
			"Help",
			"Options",
			"Highlight search matches",
		]);
		expect(Menu.last?.titles()).not.toContain("Move to right sidebar");
		Menu.last?.items.find(({ title }) => title === "Move to selected")?.click();
		expect(f.modal.choose).toHaveBeenCalledExactlyOnceWith("one");
	});

	it("uses selector help and shares the modal highlight preference", async () => {
		const f = await fixture();
		f.click(".my-palette-options-button");
		Menu.last?.items.find(({ title }) => title === "Highlight search matches")?.click();
		expect(f.modal.modalEl.classList.contains("my-palette-highlight-disabled")).toBe(true);
		f.click(".my-palette-options-button");
		Menu.last?.items.find(({ title }) => title === "Help")?.click();
		const help = document.querySelector(".my-palette-help-modal")!;
		expect(help.textContent).toContain("Folder selection help");
		expect(help.textContent).toContain("Restore a saved search without running an action");
		expect(help.textContent).not.toContain("Everything");
	});

	it("respects idle history timing, commits once per query, and cancels a pending save on close", async () => {
		const f = await fixture();
		const record = vi.spyOn(f.plugin, "recordSearch");
		await f.type("one");
		await vi.advanceTimersByTimeAsync(2_000);
		expect(record).not.toHaveBeenCalled();
		f.plugin.settings.searchHistory.addDelayMs = 1_000;
		await f.type("two");
		await vi.advanceTimersByTimeAsync(999);
		expect(record).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(record).toHaveBeenCalledExactlyOnceWith("two", "folder-move");
		f.key("ArrowDown");
		expect(record).toHaveBeenCalledTimes(1);
		f.key("f");
		await f.type("pending");
		f.modal.close();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(record).toHaveBeenCalledTimes(1);
	});

	it("closes history with Escape while retaining the selector", async () => {
		const f = await fixture();
		f.plugin.recordSearch("one", "folder-move");
		f.click(".my-palette-history-button");
		f.key("Escape");
		expect(f.modal.modalEl.isConnected).toBe(true);
		expect(
			f.modal.modalEl
				.querySelector(".my-palette-history-suggest")
				?.classList.contains("is-hidden"),
		).toBe(true);
	});
});
