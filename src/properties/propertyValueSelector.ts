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
import { countLabel } from "src/shared/countLabel";
import { t } from "src/i18n";

const VALUE_RULES: NewValueRules = {
	normalize: (query) => query.trim(),
	isValid: (value) => !value.includes("\n"),
	keyOf: (value) => value,
};

export function vaultValuesOf(app: App, key: string): string[] {
	// API がなければ、一覧はノート自身の値だけになる。
	const values = getFrontmatterValuesForKey(app, key);
	return Array.isArray(values)
		? values.filter((value): value is string => typeof value === "string")
		: [];
}

/** 1つのノートに変更を書き込む。書き込みに失敗したら false(理由はコンソールにある)。 */
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
 * リストのプロパティの変更された値を書き込む。残す値の順序は保ち、新しい値は末尾に足す。
 * 空になったリストはキーを削除する。
 */
export async function applyListChanges(
	app: App,
	file: TFile,
	key: string,
	changes: MultiSelectChanges<string>,
): Promise<boolean> {
	const updated = await writeListChanges(app, file, key, changes);
	if (!updated) {
		new Notice(t("property.error.updateFailed", { name: file.basename }));
	}
	return updated;
}

/** 一括の書き込みで、変更できたノートの数と、できなかったノートの数。 */
export interface BulkWriteResult {
	updated: number;
	failed: number;
}

/**
 * 同じ変更をすべてのノートに、1つずつ適用する。1つのノートが(壊れた YAML などで)失敗しても、
 * 残りは止まらない。変更によって元のままになったノートも、更新済みとして数える。
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

/** 各ノートのフロントマターのキャッシュから、リストのプロパティが持つ値を読む。 */
function currentValues(app: App, files: readonly TFile[], key: string): string[][] {
	return files.map((file) => {
		const frontmatter: Record<string, unknown> | undefined =
			app.metadataCache.getFileCache(file)?.frontmatter;
		return readList(frontmatter?.[key]);
	});
}

function notesLabel(files: readonly TFile[]): string {
	return files.length === 1 ? files[0].basename : countLabel(files.length, "ノート");
}

/** ノートのリストのプロパティの値セレクターを開き、結果をすべてのノートに書き込む。 */
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
			new Notice(t("property.notice.updatedOne", { key, name: files[0].basename }));
		return "done";
	}
	const { updated, failed } = await applyListChangesToFiles(plugin.app, files, key, changes);
	if (updated > 0) new Notice(t("property.notice.updatedMany", { key, count: updated }));
	if (failed > 0) new Notice(t("property.error.updateFailedKey", { key, count: failed }));
	return "done";
}

/**
 * 1つのリストのプロパティの値のセレクター。すべての対象が持つ値はチェックされ、削除できる。
 * 一部の対象だけが持つ値は、何件が持つかを表示し、残りの対象に追加できる。
 */
export class PropertyValueModal extends MultiSelectModal<string> {
	/** 各値を持つ対象の数。右クリックメニューから値を削除するたびに、最新に保つ。 */
	private counts = new Map<string, number>();

	constructor(
		private readonly plugin: MyPalettePlugin,
		private readonly files: readonly TFile[],
		private readonly key: string,
		/** 対象が今持っている値。`files` と同じ順序。 */
		current: readonly (readonly string[])[],
		private readonly vaultValues: string[],
	) {
		super(
			{
				placeholder: t("property.value.placeholder", { key }),
				contextLabel:
					files.length === 1
						? t("property.value.target", { path: files[0].path })
						: t("property.value.targets", { count: files.length }),
				actionLabel: t("property.value.add"),
				controls: {
					plugin,
					category: "property-value",
					title: t("property.value.controlsTitle"),
					description: t("property.value.description", { key }),
					actionLabel: t("property.value.add"),
					shortcuts: [
						["Space", t("shortcut.toggle")],
						["Ctrl+Enter", t("property.value.shortcutApply")],
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
			removal: { label: t("property.value.remove"), run: () => this.removeValue(value) },
		};
	}

	private partialRow(value: string): MultiSelectCandidate<string> {
		return {
			key: `value:${value}`,
			value,
			item: {
				label: value,
				badge: t("property.badge.partial", {
					count: this.counts.get(value) ?? 0,
					total: this.files.length,
				}),
			},
			removal: { label: t("property.value.remove"), run: () => this.removeValue(value) },
		};
	}

	private newRow(value: string): MultiSelectCandidate<string> {
		return {
			key: `new:${value}`,
			value,
			item: { label: value, badge: t("property.badge.newValue") },
			uncheckedIcon: "plus",
		};
	}

	/** 値を1回ですべての対象から削除し、モーダルは開いたままなので一覧を更新する。 */
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
			if (failed > 0)
				new Notice(t("property.error.updateFailedKey", { key: this.key, count: failed }));
			if (updated === 0) return;
		}
		new Notice(
			t("property.notice.removedValue", {
				value,
				key: this.key,
				name: notesLabel(this.files),
			}),
		);
		this.counts.delete(value);
	}
}
