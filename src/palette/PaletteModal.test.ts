import type { App, TFile } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { PaletteModal } from "src/palette/PaletteModal";
import type { FileResult, SearchHistoryResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import { installObsidianDom } from "src/ui/testing/obsidianDom";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	TFile: class {},
}));
vi.mock("src/palette/executePaletteResult", () => ({
	executePaletteResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("src/palette/backgroundResultActions", () => ({
	openPaletteResultInBackground: vi.fn().mockResolvedValue(true),
}));
vi.mock("src/palette/actions/resultContextMenu", () => ({ populatePaletteResultMenu: vi.fn() }));
vi.mock("src/ui/menus", () => ({ showMenuAtEvent: vi.fn() }));
// The menu is only handed to the mocked populate function, so a bare stand-in is enough.
vi.mock("src/ui/paletteMenu", () => ({
	PaletteMenu: class {
		onHide() {}
		close() {}
		setParentElement() {}
	},
}));

const cleanups: (() => void)[] = [];

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"HTMLElement",
		"Node",
		"Event",
		"MouseEvent",
		"KeyboardEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function fileResult(name: string): FileResult {
	return {
		id: `file:${name}.md`,
		mode: "file",
		primary: name,
		secondary: `${name}.md`,
		icon: "file",
		vaultPath: `${name}.md`,
	};
}

function host() {
	const activeLeaf = { id: "active" };
	const workspace = {
		getActiveFile: () => ({ path: "Active.md" }),
		getMostRecentLeaf: vi.fn().mockReturnValue(activeLeaf),
		setActiveLeaf: vi.fn(),
	};
	const app = {
		workspace,
		vault: { getAbstractFileByPath: () => null },
	} as unknown as App;
	const files = [fileResult("Alpha"), fileResult("Beta")];
	const commandSearch = vi.fn().mockResolvedValue([]);
	const paletteOpener = {
		releaseModal: vi.fn(),
		rememberClosedPalette: vi.fn(),
		openNewPaletteView: vi.fn().mockResolvedValue(undefined),
	};
	const plugin = Object.assign(createSelectorPlugin(app), {
		providers: {
			file: { search: vi.fn().mockResolvedValue(files) },
			command: { search: commandSearch },
		},
		paletteOpener,
		formatSearchHistoryInput: (entry: SearchHistoryResult) => entry.input,
	}) as unknown as MyPalettePlugin;
	return { app, plugin, files, workspace, activeLeaf, commandSearch, paletteOpener };
}

/** Lets the debounced-free session search and the modal render settle. */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function open(
	initialInput = "",
	options: ConstructorParameters<typeof PaletteModal>[4] = {},
) {
	const h = host();
	const modal = new PaletteModal(h.app, h.plugin, initialInput, undefined, {
		modeEntries: true,
		...options,
	});
	modal.open();
	cleanups.push(() => {
		if (modal.modalEl.isConnected) modal.close();
	});
	await settle();
	const rows = () => [...modal.modalEl.querySelectorAll<HTMLElement>(".suggestion-item")];
	const labels = () =>
		rows().map((row) => row.querySelector(".my-palette-suggestion__label")?.textContent);
	return { ...h, modal, rows, labels };
}

function key(el: HTMLElement, name: string, options: KeyboardEventInit = {}) {
	const event = new KeyboardEvent("keydown", {
		key: name,
		bubbles: true,
		cancelable: true,
		...options,
	});
	el.dispatchEvent(event);
	return event;
}

function mouse(el: HTMLElement, type: string, options: MouseEventInit = {}) {
	el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
}

function type(input: HTMLInputElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PaletteModal", () => {
	it("lists file results and names the source note in the footer", async () => {
		const f = await open();
		expect(f.labels()).toContain("Alpha");
		expect(f.labels()).toContain("Beta");
		expect(f.modal.modalEl.textContent).toContain("元: Active.md");
		expect(f.modal.modalEl.getAttribute("data-route")).toBe("home");
	});

	it("counts several source notes instead of naming one", async () => {
		const sourceFiles = [{ path: "A.md" }, { path: "B.md" }] as TFile[];
		const f = await open("", { sourceFiles });
		expect(f.modal.modalEl.textContent).toContain("元: 2 件のノート");
	});

	it("opens the chosen file with Enter and lets the action close the palette", async () => {
		const f = await open("alpha");
		key(f.modal.inputEl, "Enter");
		await settle();
		expect(executePaletteResult).toHaveBeenCalledExactlyOnceWith(
			f.plugin,
			expect.objectContaining({ id: "file:Alpha.md" }),
			"primary",
			expect.objectContaining({ closeWhenDone: true, active: true, autoFocus: true }),
		);
	});

	it("enters a mode from its alias and steps back to Home with Escape before closing", async () => {
		const f = await open("> build");
		expect(f.modal.modalEl.getAttribute("data-route")).toBe("mode");
		expect(f.modal.modalEl.getAttribute("data-mode")).toBe("command");
		expect(f.modal.inputEl.value).toBe("build");
		expect(f.commandSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "build" }));

		key(f.modal.inputEl, "Escape");
		await settle();
		expect(f.modal.modalEl.getAttribute("data-route")).toBe("home");
		expect(f.modal.inputEl.value).toBe(">");
		expect(f.modal.modalEl.isConnected).toBe(true);

		key(f.modal.inputEl, "Escape");
		expect(f.modal.modalEl.isConnected).toBe(false);
	});

	it("returns to Home with Backspace in an empty mode query", async () => {
		const f = await open("> ");
		expect(f.modal.modalEl.getAttribute("data-route")).toBe("mode");
		key(f.modal.inputEl, "Backspace");
		await settle();
		expect(f.modal.modalEl.getAttribute("data-route")).toBe("home");
	});

	it("hands its state to the next palette and releases itself when closed", async () => {
		const f = await open("> build");
		f.modal.close();
		expect(f.paletteOpener.releaseModal).toHaveBeenCalledWith(f.modal);
		expect(f.paletteOpener.rememberClosedPalette).toHaveBeenCalledWith(
			expect.objectContaining({ input: "> build", includeIgnored: false }),
		);
	});

	it("opens a middle-clicked file in the background and keeps the previous tab active", async () => {
		const f = await open("beta");
		const otherLeaf = { id: "background" };
		vi.mocked(openPaletteResultInBackground).mockImplementationOnce(async () => {
			f.workspace.getMostRecentLeaf.mockReturnValue(otherLeaf);
			return true;
		});
		const row = f.rows().find((el) => el.textContent?.includes("Beta"));
		mouse(row!, "auxclick", { button: 1 });
		await settle();
		expect(openPaletteResultInBackground).toHaveBeenCalledWith(
			f.plugin,
			expect.objectContaining({ id: "file:Beta.md" }),
		);
		expect(f.workspace.setActiveLeaf).toHaveBeenCalledWith(f.activeLeaf, { focus: false });
		expect(f.modal.modalEl.isConnected).toBe(true);
	});

	it("builds the context menu for the right-clicked row and the current selection", async () => {
		const f = await open();
		const row = f.rows().find((el) => el.textContent?.includes("Beta"));
		mouse(row!, "mousedown", { button: 2 });
		mouse(row!, "contextmenu", { button: 2 });
		expect(populatePaletteResultMenu).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				result: expect.objectContaining({ id: "file:Beta.md" }),
				selectedItems: [expect.objectContaining({ id: "file:Beta.md" })],
			}),
		);
	});

	it("applies a search history entry instead of opening it", async () => {
		const f = await open();
		const history: SearchHistoryResult = {
			id: "search-history:command:> deploy",
			mode: "search-history",
			primary: "> deploy",
			secondary: "Search history",
			icon: "history",
			input: "> deploy",
			category: "command",
			lastSearchedAt: 0,
			count: 1,
		};
		mouse(f.rows()[0], "contextmenu", { button: 2 });
		vi.mocked(populatePaletteResultMenu).mock.calls[0][0].applySearchHistory(history);
		await settle();
		expect(executePaletteResult).not.toHaveBeenCalled();
		expect(f.modal.modalEl.getAttribute("data-mode")).toBe("command");
		expect(f.commandSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "deploy" }));
	});

	it("moves the live search into a new sidebar palette", async () => {
		const f = await open("> build");
		type(f.modal.inputEl, "deploy");
		await settle();
		// The options menu owns this item and is stubbed here, so call what it calls.
		(f.modal as unknown as { moveToSidebar: () => void }).moveToSidebar();
		expect(f.modal.modalEl.isConnected).toBe(false);
		expect(f.paletteOpener.openNewPaletteView).toHaveBeenCalledWith({
			input: "> deploy",
			includeIgnored: false,
		});
	});
});
