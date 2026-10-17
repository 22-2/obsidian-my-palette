import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { propertyTargetPaths, type PropertyResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import { editListProperty } from "src/properties/propertyValueSelector";
import { editPropertyValue } from "src/properties/propertyInputSelector";
import { SelectionModal } from "src/ui/selectionModal";
import { updateFrontmatter } from "src/shared/frontmatter";
import { PROPERTY_KIND_ICONS } from "src/properties/propertyKind";

/** Whether the palette should close once the edit has started. */
export type PropertyEditOutcome = "close" | "stay";

/** The notes a row edits that still exist. */
function targetFiles(app: App, result: PropertyResult): TFile[] {
	return propertyTargetPaths(result).flatMap((path) => app.vault.getFileByPath(path) ?? []);
}

/**
 * Starts the editor for a property row. Tags opens Tag insertion, which only
 * writes the `tags` key; a checkbox flips in place so the list can show the change.
 * A row spanning several notes edits all of them, which only tags and list values can do yet.
 */
export async function editPropertyResult(
	plugin: MyPalettePlugin,
	result: PropertyResult,
): Promise<PropertyEditOutcome> {
	const files = targetFiles(plugin.app, result);
	if (files.length === 0) {
		new Notice("The note for this property no longer exists.");
		return "stay";
	}
	const [file] = files;
	const many = files.length > 1;
	switch (result.kind) {
		case "tags":
			return (await insertTags(plugin, files)) ? "close" : "stay";
		case "list":
			return (await editListProperty(plugin, files, result.key)) === "done"
				? "close"
				: "stay";
		case "new":
			return addNewProperty(plugin, files, result.key);
		case "unsupported":
			new Notice("Edit this property in source mode.");
			return "stay";
		case "checkbox":
		case "text":
		case "number":
		case "date":
		case "datetime":
			if (many) {
				new Notice(`Setting ${result.key} on several notes is not supported yet.`);
				return "stay";
			}
			if (result.kind === "checkbox") {
				await toggleCheckbox(plugin.app, file, result.key);
				return "stay";
			}
			return (await editPropertyValue(plugin, file, result.key, result.kind)) === "done"
				? "close"
				: "stay";
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
	{ label: "Text", kind: "text", icon: PROPERTY_KIND_ICONS.text },
	{ label: "List", kind: "list", icon: PROPERTY_KIND_ICONS.list },
	{ label: "Number", kind: "number", icon: PROPERTY_KIND_ICONS.number },
	{ label: "Checkbox", kind: "checkbox", icon: PROPERTY_KIND_ICONS.checkbox },
	{ label: "Date", kind: "date", icon: PROPERTY_KIND_ICONS.date },
	{ label: "Date & time", kind: "datetime", icon: PROPERTY_KIND_ICONS.datetime },
];

/** Picks a type; Esc resolves with null so nothing is added. */
class NewKindModal extends SelectionModal<NewKindItem> {
	private chosen?: NewKind;

	constructor(
		placeholder: string,
		app: App,
		items: readonly NewKindItem[],
		private readonly resolve: (kind: NewKind | null) => void,
	) {
		super({ placeholder, items: [...items] }, app);
	}

	protected override async onItemActivated(item: NewKindItem): Promise<void> {
		this.chosen = item.kind;
		this.close();
	}

	protected override onSelectionModalClose(): void {
		this.resolve(this.chosen ?? null);
	}
}

/** Several notes can only get a list value yet, so the picker offers nothing else. */
function chooseNewKind(app: App, key: string, many: boolean): Promise<NewKind | null> {
	const items = many ? NEW_KIND_ITEMS.filter(({ kind }) => kind === "list") : NEW_KIND_ITEMS;
	return new Promise((resolve) => {
		new NewKindModal(`Type for ${key}`, app, items, resolve).open();
	});
}

/** Adds a key the note lacks: pick its type, then edit the value as that type does. */
async function addNewProperty(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	key: string,
): Promise<PropertyEditOutcome> {
	// Why: Esc in an editor goes back to the type picker, so a type can be changed
	// before anything is written; the palette stays open underneath throughout.
	for (;;) {
		const kind = await chooseNewKind(plugin.app, key, files.length > 1);
		if (!kind) return "stay";
		const outcome = await editNewKind(plugin, files, key, kind);
		if (outcome !== "dismissed") return outcome;
	}
}

/** Runs the editor for a new key's type; a dismissed editor returns "dismissed". */
async function editNewKind(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	key: string,
	kind: NewKind,
): Promise<PropertyEditOutcome | "dismissed"> {
	// Only the list type is offered for several notes, so the others always have one note.
	const [file] = files;
	switch (kind) {
		case "checkbox":
			await toggleCheckbox(plugin.app, file, key);
			return "stay";
		case "list":
			return (await editListProperty(plugin, files, key)) === "done" ? "close" : "dismissed";
		case "text":
		case "number":
		case "date":
		case "datetime":
			return (await editPropertyValue(plugin, file, key, kind)) === "done"
				? "close"
				: "dismissed";
	}
}
