import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { readList } from "src/properties/propertyList";
import type { EditResult } from "src/properties/propertyInputSelector";
import { typedNewValue, type NewValueRules } from "src/shared/newValue";
import { MultiSelectModal, type MultiSelectCandidate } from "src/ui/MultiSelectModal";
import { changeCount, type MultiSelectChanges } from "src/ui/multiSelectChanges";
import { setOrDeleteFrontmatterList, updateFrontmatter } from "src/shared/frontmatter";
import { getFrontmatterValuesForKey } from "src/platform/obsidianInternals";

const VALUE_RULES: NewValueRules = {
	normalize: (query) => query.trim(),
	isValid: (value) => !value.includes("\n"),
	keyOf: (value) => value,
};

export function vaultValuesOf(app: App, key: string): string[] {
	// A missing API leaves the list with only the note's own values.
	const values = getFrontmatterValuesForKey(app, key);
	return Array.isArray(values)
		? values.filter((value): value is string => typeof value === "string")
		: [];
}

/** Writes the changes to one note; false when the write failed (the reason is in the console). */
async function writeListChanges(
	app: App,
	file: TFile,
	key: string,
	changes: MultiSelectChanges<string>,
): Promise<boolean> {
	return updateFrontmatter(app, file, `update the property ${key} of`, (frontmatter) => {
		const current = readList(frontmatter[key]);
		const next = [
			...current.filter((value) => !changes.remove.includes(value)),
			...changes.add.filter((value) => !current.includes(value)),
		];
		setOrDeleteFrontmatterList(frontmatter, key, next);
	});
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
	const updated = await writeListChanges(app, file, key, changes);
	if (!updated) {
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
	}
	return updated;
}

/** How many notes a bulk write changed and how many it could not. */
export interface BulkWriteResult {
	updated: number;
	failed: number;
}

/**
 * Applies the same changes to every note, one at a time, so one failing note (broken YAML)
 * does not stop the rest. Notes the changes leave as they were still count as updated.
 */
export async function applyListChangesToFiles(
	app: App,
	files: readonly TFile[],
	key: string,
	changes: MultiSelectChanges<string>,
): Promise<BulkWriteResult> {
	const result: BulkWriteResult = { updated: 0, failed: 0 };
	for (const file of files) {
		if (await writeListChanges(app, file, key, changes)) result.updated += 1;
		else result.failed += 1;
	}
	return result;
}

/** Reads the values a list property has in each note's frontmatter cache. */
function currentValues(app: App, files: readonly TFile[], key: string): string[][] {
	return files.map((file) => {
		const frontmatter: Record<string, unknown> | undefined =
			app.metadataCache.getFileCache(file)?.frontmatter;
		return readList(frontmatter?.[key]);
	});
}

function notesLabel(files: readonly TFile[]): string {
	return files.length === 1 ? files[0].basename : `${files.length} notes`;
}

/** Opens the value selector for a list property of the notes and writes the result to all of them. */
export async function editListProperty(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	key: string,
): Promise<EditResult> {
	const modal = new PropertyValueModal(
		plugin,
		files,
		key,
		currentValues(plugin.app, files, key),
		vaultValuesOf(plugin.app, key),
	);
	const changes = await modal.openAndWaitChanges();
	if (!changes || changeCount(changes) === 0) return "dismissed";
	if (files.length === 1) {
		if (await applyListChanges(plugin.app, files[0], key, changes))
			new Notice(`Updated ${key} on ${files[0].basename}.`);
		return "done";
	}
	const { updated, failed } = await applyListChangesToFiles(plugin.app, files, key, changes);
	if (updated > 0) new Notice(`Updated ${key} on ${updated} notes.`);
	if (failed > 0) new Notice(`Could not update ${key} on ${failed} notes. See the console.`);
	return "done";
}

/**
 * Selector for the values of one list property. A value every target has is checked and can be
 * removed; a value only some targets have shows how many and can be added to the rest.
 */
export class PropertyValueModal extends MultiSelectModal<string> {
	/** How many targets have each value, kept current as values are removed from the context menu. */
	private counts = new Map<string, number>();

	constructor(
		private readonly plugin: MyPalettePlugin,
		private readonly files: readonly TFile[],
		private readonly key: string,
		/** The values each target has now, in the same order as `files`. */
		current: readonly (readonly string[])[],
		private readonly vaultValues: string[],
	) {
		super(
			{
				placeholder: `Select values for ${key} (type to add a new value)`,
				contextLabel:
					files.length === 1
						? `Target: ${files[0].path}`
						: `Targets: ${files.length} notes`,
				actionLabel: "Add",
				controls: {
					plugin,
					category: "property-value",
					title: "Property value selector",
					description: `Values of ${key} in the target ${files.length === 1 ? "note" : "notes"}. Checked values are kept on every target; unchecking a value that all targets have removes it when you run the selector.`,
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
		for (const values of current)
			for (const value of new Set(values))
				this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
	}

	private get everyTarget(): string[] {
		return [...this.counts].filter(([, n]) => n === this.files.length).map(([value]) => value);
	}

	private get someTargets(): string[] {
		return [...this.counts].filter(([, n]) => n < this.files.length).map(([value]) => value);
	}

	protected searchCandidates(query: string): MultiSelectCandidate<string>[] {
		const every = this.everyTarget.map((value) => this.appliedRow(value));
		const some = this.someTargets.map((value) => this.partialRow(value));
		const others = this.vaultValues
			.filter((value) => !this.counts.has(value))
			.map((value) => this.valueRow(value));
		const all = [...every, ...some, ...others];
		const matched = query.trim()
			? searchFuzzyQuery(query, all, [(row) => row.value]).map(({ obj }) => obj)
			: all;
		const newValue = typedNewValue(
			query,
			[...this.counts.keys(), ...this.vaultValues],
			VALUE_RULES,
		);
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

	private partialRow(value: string): MultiSelectCandidate<string> {
		return {
			key: `value:${value}`,
			value,
			item: {
				label: value,
				badge: `On ${this.counts.get(value)}/${this.files.length} notes`,
			},
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

	/** Removes one value from every target at once and updates the list, since the modal stays open. */
	private async removeValue(value: string): Promise<void> {
		const changes = { add: [], remove: [value] };
		if (this.files.length === 1) {
			if (!(await applyListChanges(this.plugin.app, this.files[0], this.key, changes)))
				return;
		} else {
			const { updated, failed } = await applyListChangesToFiles(
				this.plugin.app,
				this.files,
				this.key,
				changes,
			);
			if (failed > 0) new Notice(`Could not update ${failed} notes. See the console.`);
			if (updated === 0) return;
		}
		new Notice(`Removed ${value} from ${this.key} on ${notesLabel(this.files)}.`);
		this.counts.delete(value);
	}
}
