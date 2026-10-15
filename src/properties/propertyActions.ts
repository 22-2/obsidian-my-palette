import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import { editListProperty } from "src/properties/propertyValueSelector";
import { editPropertyValue } from "src/properties/propertyInputSelector";
import { SelectionModal } from "src/ui/selectionModal";
import { updateFrontmatter } from "src/shared/frontmatter";

/** Whether the palette should close once the edit has started. */
export type PropertyEditOutcome = "close" | "stay";

/**
 * Starts the editor for a property row. Tags opens Tag insertion, which only
 * writes the `tags` key; a checkbox flips in place so the list can show the change.
 */
export async function editPropertyResult(
	plugin: MyPalettePlugin,
	result: PropertyResult,
): Promise<PropertyEditOutcome> {
	const file = plugin.app.vault.getFileByPath(result.sourcePath);
	if (!file) {
		new Notice("The note for this property no longer exists.");
		return "stay";
	}
	switch (result.kind) {
		case "tags":
			await insertTags(plugin, [file]);
			return "close";
		case "checkbox":
			await toggleCheckbox(plugin.app, file, result.key);
			return "stay";
		case "list":
			return (await editListProperty(plugin, file, result.key)) === "done" ? "close" : "stay";
		case "text":
		case "number":
		case "date":
		case "datetime":
			return (await editPropertyValue(plugin, file, result.key, result.kind)) === "done"
				? "close"
				: "stay";
		case "new":
			return addNewProperty(plugin, file, result.key);
		case "unsupported":
			new Notice("Edit this property in source mode.");
			return "stay";
		default:
			return "stay";
	}
}

/** Sets a checkbox to true unless it is already true, so a missing key is added as true. */
async function toggleCheckbox(app: App, file: TFile, key: string): Promise<void> {
	const current: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[key];
	const next = current !== true;
	const updated = await updateFrontmatter(
		app,
		file,
		`update the property ${key} of`,
		(frontmatter) => {
			frontmatter[key] = next;
		},
	);
	if (!updated) {
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
		return;
	}
	new Notice(`Set ${key} to ${next} on ${file.basename}.`);
}

/** The types a new key can start with; the type is only used to open its editor, never stored. */
type NewKind = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

interface NewKindItem {
	label: string;
	kind: NewKind;
	icon: string;
}

const NEW_KIND_ITEMS: readonly NewKindItem[] = [
	{ label: "Text", kind: "text", icon: "text" },
	{ label: "List", kind: "list", icon: "list" },
	{ label: "Number", kind: "number", icon: "binary" },
	{ label: "Checkbox", kind: "checkbox", icon: "check-square" },
	{ label: "Date", kind: "date", icon: "calendar" },
	{ label: "Date & time", kind: "datetime", icon: "clock" },
];

/** Picks a type; Esc resolves with null so nothing is added. */
class NewKindModal extends SelectionModal<NewKindItem> {
	private chosen?: NewKind;

	constructor(
		placeholder: string,
		app: App,
		private readonly resolve: (kind: NewKind | null) => void,
	) {
		super({ placeholder, items: [...NEW_KIND_ITEMS] }, app);
	}

	protected override async onItemActivated(item: NewKindItem): Promise<void> {
		this.chosen = item.kind;
		this.close();
	}

	protected override onSelectionModalClose(): void {
		this.resolve(this.chosen ?? null);
	}
}

function chooseNewKind(app: App, key: string): Promise<NewKind | null> {
	return new Promise((resolve) => {
		new NewKindModal(`Type for ${key}`, app, resolve).open();
	});
}

/** Adds a key the note lacks: pick its type, then edit the value as that type does. */
async function addNewProperty(
	plugin: MyPalettePlugin,
	file: TFile,
	key: string,
): Promise<PropertyEditOutcome> {
	// Why: Esc in an editor goes back to the type picker, so a type can be changed
	// before anything is written; the palette stays open underneath throughout.
	for (;;) {
		const kind = await chooseNewKind(plugin.app, key);
		if (!kind) return "stay";
		const outcome = await editNewKind(plugin, file, key, kind);
		if (outcome !== "dismissed") return outcome;
	}
}

/** Runs the editor for a new key's type; a dismissed editor returns "dismissed". */
async function editNewKind(
	plugin: MyPalettePlugin,
	file: TFile,
	key: string,
	kind: NewKind,
): Promise<PropertyEditOutcome | "dismissed"> {
	switch (kind) {
		case "checkbox":
			await toggleCheckbox(plugin.app, file, key);
			return "stay";
		case "list":
			return (await editListProperty(plugin, file, key)) === "done" ? "close" : "dismissed";
		case "text":
		case "number":
		case "date":
		case "datetime":
			return (await editPropertyValue(plugin, file, key, kind)) === "done"
				? "close"
				: "dismissed";
	}
}
