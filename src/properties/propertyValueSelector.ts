import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { typedNewValue, type NewValueRules } from "src/shared/newValue";
import { MultiSelectModal, type MultiSelectCandidate } from "src/ui/MultiSelectModal";
import { changeCount, type MultiSelectChanges } from "src/ui/multiSelectChanges";

// Unofficial API: the values already used for a key anywhere in the vault. A
// missing function leaves the list with only the note's own values.
interface MetadataValuesSource {
	getFrontmatterPropertyValuesForKey?: (key: string) => unknown;
}

const VALUE_RULES: NewValueRules = {
	normalize: (query) => query.trim(),
	isValid: (value) => !value.includes("\n"),
	keyOf: (value) => value,
};

/** The strings in a list-type property; a single string counts as a one-item list. */
export function readList(value: unknown): string[] {
	if (typeof value === "string") return value ? [value] : [];
	if (!Array.isArray(value)) return [];
	return value.flatMap((item: unknown) =>
		typeof item === "string" || typeof item === "number" ? [String(item)] : [],
	);
}

function vaultValuesOf(app: App, key: string): string[] {
	const values = (
		app.metadataCache as unknown as MetadataValuesSource
	).getFrontmatterPropertyValuesForKey?.(key);
	return Array.isArray(values)
		? values.filter((value): value is string => typeof value === "string")
		: [];
}

/**
 * Writes the changed values of a list property. The order of the kept values is
 * preserved and new ones are appended; a list left empty removes the key.
 */
export async function applyListChanges(
	app: App,
	file: TFile,
	key: string,
	changes: MultiSelectChanges<string>,
): Promise<boolean> {
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			const current = readList(frontmatter[key]);
			const next = [
				...current.filter((value) => !changes.remove.includes(value)),
				...changes.add.filter((value) => !current.includes(value)),
			];
			if (next.length > 0) frontmatter[key] = next;
			else delete frontmatter[key];
		});
		return true;
	} catch (error) {
		console.error(`Failed to update the property ${key} of ${file.path}`, error);
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
		return false;
	}
}

/** Opens the value selector for a list property of the note and writes the result. */
export async function editListProperty(
	plugin: MyPalettePlugin,
	file: TFile,
	key: string,
): Promise<void> {
	const frontmatter: Record<string, unknown> | undefined =
		plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const modal = new PropertyValueModal(
		plugin,
		file,
		key,
		readList(frontmatter?.[key]),
		vaultValuesOf(plugin.app, key),
	);
	const changes = await modal.openAndWaitChanges();
	if (!changes || changeCount(changes) === 0) return;
	if (await applyListChanges(plugin.app, file, key, changes))
		new Notice(`Updated ${key} on ${file.basename}.`);
}

/** Selector for the values of one list property; applied values are checked and can be removed. */
export class PropertyValueModal extends MultiSelectModal<string> {
	/** Values the note has now, kept current as they are removed from the context menu. */
	private current: string[];

	constructor(
		private readonly plugin: MyPalettePlugin,
		private readonly file: TFile,
		private readonly key: string,
		current: string[],
		private readonly vaultValues: string[],
	) {
		super(
			{
				placeholder: `Select values for ${key} (type to add a new value)`,
				contextLabel: `Target: ${file.path}`,
				actionLabel: "Add",
				controls: {
					plugin,
					category: "property-value",
					title: "Property value selector",
					description: `Values of ${key} in the target note. Checked values are kept; unchecking a value removes it when you run the selector.`,
					actionLabel: "Add",
					shortcuts: [
						["Space", "Toggle checks in selection mode"],
						[
							"Ctrl+Enter",
							"Apply the checks: add checked values and remove unchecked ones; with no changes, add the selected values",
						],
					],
				},
			},
			plugin.app,
		);
		this.current = current;
	}

	protected searchCandidates(query: string): MultiSelectCandidate<string>[] {
		const applied = this.current.map((value) => this.appliedRow(value));
		const others = this.vaultValues
			.filter((value) => !this.current.includes(value))
			.map((value) => this.valueRow(value));
		const matched = query.trim()
			? searchFuzzyQuery(query, [...applied, ...others], [(row) => row.value]).map(
					({ obj }) => obj,
				)
			: [...applied, ...others];
		const newValue = typedNewValue(query, [...this.current, ...this.vaultValues], VALUE_RULES);
		return newValue ? [this.newRow(newValue), ...matched] : matched;
	}

	private valueRow(value: string): MultiSelectCandidate<string> {
		return { key: `value:${value}`, value, item: { label: value } };
	}

	private appliedRow(value: string): MultiSelectCandidate<string> {
		return {
			...this.valueRow(value),
			applied: true,
			removal: { label: "Remove value", run: () => this.removeValue(value) },
		};
	}

	private newRow(value: string): MultiSelectCandidate<string> {
		return {
			key: `new:${value}`,
			value,
			item: { label: value, badge: "New value" },
			uncheckedIcon: "plus",
		};
	}

	/** Removes one value at once and updates the list, since the modal stays open. */
	private async removeValue(value: string): Promise<void> {
		const removed = await applyListChanges(this.plugin.app, this.file, this.key, {
			add: [],
			remove: [value],
		});
		if (!removed) return;
		new Notice(`Removed ${value} from ${this.key} on ${this.file.basename}.`);
		this.current = this.current.filter((existing) => existing !== value);
	}
}
