import type { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { editPropertyResult } from "src/properties/propertyActions";
import { editPropertyValue } from "src/properties/propertyInputSelector";
import { editListProperty } from "src/properties/propertyValueSelector";

const notices = vi.hoisted(() => [] as string[]);
const insertTagsMock = vi.hoisted(() => vi.fn());
const selectedKinds = vi.hoisted(() => [] as Array<string | null>);

vi.mock("src/ui/selectionModal", () => ({
	SelectionModal: class {
		constructor(private readonly props: { items: Array<{ kind: string }> }) {}
		open(): void {
			const kind = selectedKinds.shift();
			const item = this.props.items.find((item) => item.kind === kind);
			if (item) void this.onItemActivated(item);
			else this.close();
		}
		close(): void {
			this.onSelectionModalClose();
		}
		protected async onItemActivated(_item: { kind: string }): Promise<void> {}
		protected onSelectionModalClose(): void {}
	},
}));

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));
vi.mock("src/tags/insertTags", () => ({ insertTags: insertTagsMock }));
vi.mock("src/properties/propertyValueSelector", () => ({
	editListProperty: vi.fn(),
	vaultValuesOf: vi.fn(() => []),
}));
vi.mock("src/properties/propertyInputSelector", () => ({ editPropertyValue: vi.fn() }));

const file = { path: "note.md", basename: "note" } as unknown as TFile;

function plugin(frontmatter: Record<string, unknown>, options: { fail?: boolean } = {}) {
	const written: Record<string, unknown> = {};
	const app = {
		vault: { getFileByPath: (path: string) => (path === "note.md" ? file : null) },
		metadataCache: { getFileCache: () => ({ frontmatter }) },
		fileManager: {
			processFrontMatter: async (_file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				if (options.fail) throw new Error("YAML");
				fn(written);
			},
		},
	};
	return { plugin: { app } as unknown as MyPalettePlugin, written };
}

function row(overrides: Partial<PropertyResult>): PropertyResult {
	return {
		id: "property:x",
		mode: "property",
		primary: "x",
		secondary: "",
		icon: "check-square",
		key: "x",
		kind: "checkbox",
		section: "This note",
		inNote: true,
		sourcePath: "note.md",
		...overrides,
	};
}

beforeEach(() => {
	notices.length = 0;
	selectedKinds.length = 0;
	insertTagsMock.mockReset();
	vi.mocked(editPropertyValue).mockReset().mockResolvedValue("done");
	vi.mocked(editListProperty).mockReset().mockResolvedValue("done");
});

describe("editPropertyResult", () => {
	it("sets a missing checkbox to true", async () => {
		const { plugin: p, written } = plugin({});
		const outcome = await editPropertyResult(p, row({ key: "done" }));
		expect(outcome).toBe("stay");
		expect(written).toEqual({ done: true });
		expect(notices).toEqual(["Set done to true on note."]);
	});

	it("flips a true checkbox to false and a false one to true", async () => {
		const first = plugin({ done: true });
		await editPropertyResult(first.plugin, row({ key: "done" }));
		expect(first.written).toEqual({ done: false });
		const second = plugin({ done: false });
		await editPropertyResult(second.plugin, row({ key: "done" }));
		expect(second.written).toEqual({ done: true });
	});

	it("reports a failed write without changing the list", async () => {
		const { plugin: p } = plugin({}, { fail: true });
		const outcome = await editPropertyResult(p, row({ key: "done" }));
		expect(outcome).toBe("stay");
		expect(notices).toEqual(["Could not update the properties of note. See the console."]);
	});

	it("keeps the palette when Tag insertion is cancelled", async () => {
		const { plugin: p } = plugin({});
		insertTagsMock.mockResolvedValue(false);
		expect(await editPropertyResult(p, row({ key: "tags", kind: "tags" }))).toBe("stay");
	});

	it("opens Tag insertion for the tags key and closes the palette", async () => {
		const { plugin: p } = plugin({});
		insertTagsMock.mockResolvedValue(true);
		const outcome = await editPropertyResult(p, row({ key: "tags", kind: "tags" }));
		expect(outcome).toBe("close");
		expect(insertTagsMock).toHaveBeenCalledWith(p, [file]);
	});

	it("opens the value input for text, number, date and date-time rows and closes", async () => {
		const { plugin: p } = plugin({});
		for (const kind of ["text", "number", "date", "datetime"] as const) {
			vi.mocked(editPropertyValue).mockClear();
			const outcome = await editPropertyResult(p, row({ key: "due", kind }));
			expect(outcome).toBe("close");
			expect(editPropertyValue).toHaveBeenCalledWith(p, file, "due", kind);
		}
	});

	it("opens the list selector for list rows and closes", async () => {
		const { plugin: p } = plugin({});
		const outcome = await editPropertyResult(p, row({ key: "aliases", kind: "list" }));
		expect(outcome).toBe("close");
		expect(editListProperty).toHaveBeenCalledWith(p, file, "aliases");
	});

	it("tells the user that nested values are edited in source mode", async () => {
		const { plugin: p } = plugin({});
		await editPropertyResult(p, row({ kind: "unsupported" }));
		expect(notices).toEqual(["Edit this property in source mode."]);
	});

	it.each(["text", "number", "date", "datetime", "list"] as const)(
		"returns to the property list when the %s editor is dismissed",
		async (kind) => {
			const { plugin: p, written } = plugin({});
			vi.mocked(editPropertyValue).mockResolvedValue("dismissed");
			vi.mocked(editListProperty).mockResolvedValue("dismissed");
			const outcome = await editPropertyResult(p, row({ key: "due", kind }));
			expect(outcome).toBe("stay");
			expect(written).toEqual({});
		},
	);

	it.each(["text", "list"] as const)(
		"returns to type selection when a new %s editor is dismissed",
		async (kind) => {
			const { plugin: p, written } = plugin({});
			selectedKinds.push(kind, "number");
			if (kind === "list") vi.mocked(editListProperty).mockResolvedValueOnce("dismissed");
			else vi.mocked(editPropertyValue).mockResolvedValueOnce("dismissed");
			const outcome = await editPropertyResult(p, row({ key: "due", kind: "new" }));
			expect(outcome).toBe("close");
			expect(editPropertyValue).toHaveBeenLastCalledWith(p, file, "due", "number");
			expect(selectedKinds).toEqual([]);
			expect(written).toEqual({});
		},
	);

	it("returns to the property list when type selection is dismissed after an editor", async () => {
		const { plugin: p, written } = plugin({});
		selectedKinds.push("text", null);
		vi.mocked(editPropertyValue).mockResolvedValueOnce("dismissed");
		expect(await editPropertyResult(p, row({ key: "due", kind: "new" }))).toBe("stay");
		expect(selectedKinds).toEqual([]);
		expect(written).toEqual({});
	});

	it("reports a missing source note", async () => {
		const { plugin: p } = plugin({});
		const outcome = await editPropertyResult(p, row({ sourcePath: "gone.md" }));
		expect(outcome).toBe("stay");
		expect(notices).toEqual(["The note for this property no longer exists."]);
	});
});
