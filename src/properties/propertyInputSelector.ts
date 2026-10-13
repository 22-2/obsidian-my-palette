import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import {
	propertyInputRows,
	type InputPropertyKind,
	type PropertyInputRow,
} from "src/properties/propertyInput";
import { vaultValuesOf } from "src/properties/propertyValueSelector";
import { SelectionModal } from "src/ui/selectionModal";

interface PropertyInputOptions {
	placeholder: string;
	initialInput: string;
	rows: (query: string) => PropertyInputRow[];
}

/** A single-value input: the typed text is written by its first row, and Esc keeps the value. */
class PropertyInputModal extends SelectionModal<PropertyInputRow> {
	private chosen?: string | number;

	constructor(
		options: PropertyInputOptions,
		app: App,
		private readonly resolve: (value: string | number | null) => void,
	) {
		super(
			{
				placeholder: options.placeholder,
				initialInput: options.initialInput,
				search: options.rows,
			},
			app,
		);
	}

	// Why: a row that cannot be written explains the problem and keeps the input open.
	protected override async onItemActivated(row: PropertyInputRow): Promise<void> {
		if (row.value === undefined) return;
		this.chosen = row.value;
		this.close();
	}

	protected override onSelectionModalClose(): void {
		this.resolve(this.chosen ?? null);
	}
}

/** Resolves with the value to write, or null when the input was dismissed. */
function chooseValue(app: App, options: PropertyInputOptions): Promise<string | number | null> {
	return new Promise((resolve) => {
		const modal = new PropertyInputModal(options, app, resolve);
		modal.open();
		// Why: the current value is selected so typing replaces it, as in a plain text field.
		modal.inputEl.select();
	});
}

function initialText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Opens the single-value input for a property of the note and writes the chosen value. */
export async function editPropertyValue(
	plugin: MyPalettePlugin,
	file: TFile,
	key: string,
	kind: InputPropertyKind,
): Promise<void> {
	const frontmatter: Record<string, unknown> | undefined =
		plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const current: unknown = frontmatter?.[key];
	const vaultValues = vaultValuesOf(plugin.app, key);
	const value = await chooseValue(plugin.app, {
		placeholder: `Enter a value for ${key}`,
		initialInput: initialText(current),
		rows: (query) => propertyInputRows({ kind, query, current, vaultValues }),
	});
	if (value === null) return;
	if (await writeValue(plugin.app, file, key, value))
		new Notice(`Updated ${key} on ${file.basename}.`);
}

async function writeValue(
	app: App,
	file: TFile,
	key: string,
	value: string | number,
): Promise<boolean> {
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[key] = value;
		});
		return true;
	} catch (error) {
		console.error(`Failed to update the property ${key} of ${file.path}`, error);
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
		return false;
	}
}
