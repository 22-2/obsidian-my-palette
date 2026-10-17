import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import {
	propertyInputRows,
	type InputPropertyKind,
	type PropertyInputRow,
} from "src/properties/propertyInput";
import { vaultValuesOf } from "src/properties/propertyValueSelector";
import { SelectionModal } from "src/ui/selectionModal";
import { updateFrontmatter } from "src/shared/frontmatter";
import { t } from "src/i18n";

interface PropertyInputOptions {
	placeholder: string;
	initialInput: string;
	rows: (query: string) => PropertyInputRow[];
}

/** 単一の値の入力。入力された文字列は最初の行が書き込み、Esc では値を保つ。 */
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

	// Why: 書き込めない行は、問題を説明して入力欄を開いたままにする。
	protected override async onItemActivated(row: PropertyInputRow): Promise<void> {
		if (row.value === undefined) return;
		this.chosen = row.value;
		this.close();
	}

	protected override onSelectionModalClose(): void {
		this.resolve(this.chosen ?? null);
	}
}

/** 書き込む値で解決する。入力が閉じられたときは null。 */
function chooseValue(app: App, options: PropertyInputOptions): Promise<string | number | null> {
	return new Promise((resolve) => {
		const modal = new PropertyInputModal(options, app, resolve);
		modal.open();
		// Why: 現在の値を選択しておくと、通常のテキスト欄と同じく入力で置き換わる。
		modal.inputEl.select();
	});
}

/** エディターが Esc で閉じられた(dismissed)か、値を入れて終わった(done)か。 */
export type EditResult = "dismissed" | "done";

function initialText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** ノートのプロパティの単一値の入力を開き、選んだ値を書き込む。 */
export async function editPropertyValue(
	plugin: MyPalettePlugin,
	file: TFile,
	key: string,
	kind: InputPropertyKind,
): Promise<EditResult> {
	const frontmatter: Record<string, unknown> | undefined =
		plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	const current: unknown = frontmatter?.[key];
	const vaultValues = vaultValuesOf(plugin.app, key);
	const value = await chooseValue(plugin.app, {
		placeholder: t("property.placeholder.input", { key }),
		initialInput: initialText(current),
		rows: (query) => propertyInputRows({ kind, query, current, vaultValues }),
	});
	if (value === null) return "dismissed";
	if (await writeValue(plugin.app, file, key, value))
		new Notice(t("property.notice.updatedOne", { key, name: file.basename }));
	return "done";
}

async function writeValue(
	app: App,
	file: TFile,
	key: string,
	value: string | number,
): Promise<boolean> {
	const updated = await updateFrontmatter(
		app,
		file,
		`update the property ${key} of`,
		(frontmatter) => {
			frontmatter[key] = value;
		},
	);
	if (!updated) new Notice(t("property.error.updateFailed", { name: file.basename }));
	return updated;
}
