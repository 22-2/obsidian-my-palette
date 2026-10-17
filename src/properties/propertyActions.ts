import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { propertyTargetPaths, type PropertyResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import { editListProperty } from "src/properties/propertyValueSelector";
import { editPropertyValue } from "src/properties/propertyInputSelector";
import { SelectionModal } from "src/ui/selectionModal";
import { updateFrontmatter } from "src/shared/frontmatter";
import { PROPERTY_KIND_ICONS } from "src/properties/propertyKind";
import { t } from "src/i18n";

/** 編集を始めたあとに、パレットを閉じるかどうか。 */
export type PropertyEditOutcome = "close" | "stay";

/** 行が編集する、まだ存在するノート。 */
function targetFiles(app: App, result: PropertyResult): TFile[] {
	return propertyTargetPaths(result).flatMap((path) => app.vault.getFileByPath(path) ?? []);
}

/**
 * プロパティの行のエディターを開始する。タグは `tags` キーだけを書くタグ挿入を開き、
 * チェックボックスはその場で切り替えて、一覧に変化を表示できるようにする。
 * 複数のノートにまたがる行は、それらすべてを編集する。今それができるのは、タグとリストの値だけ。
 */
export async function editPropertyResult(
	plugin: MyPalettePlugin,
	result: PropertyResult,
): Promise<PropertyEditOutcome> {
	const files = targetFiles(plugin.app, result);
	if (files.length === 0) {
		new Notice(t("property.error.noteGone"));
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
			new Notice(t("property.notice.editInSource"));
			return "stay";
		case "checkbox":
		case "text":
		case "number":
		case "date":
		case "datetime":
			if (many) {
				new Notice(t("property.notice.bulkUnsupported", { key: result.key }));
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

/** 値が true でなければ true にする。キーがなければ true として追加する。 */
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
		new Notice(t("property.error.updateFailed", { name: file.basename }));
		return;
	}
	new Notice(t("property.notice.set", { key, value: String(next), name: file.basename }));
}

/** 新しいキーが始められる種類。種類はエディターを開くためだけに使い、保存はしない。 */
type NewKind = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

interface NewKindItem {
	label: string;
	kind: NewKind;
	icon: string;
}

const NEW_KIND_ITEMS: readonly NewKindItem[] = [
	{ label: t("property.kind.text"), kind: "text", icon: PROPERTY_KIND_ICONS.text },
	{ label: t("property.kind.list"), kind: "list", icon: PROPERTY_KIND_ICONS.list },
	{ label: t("property.kind.number"), kind: "number", icon: PROPERTY_KIND_ICONS.number },
	{ label: t("property.kind.checkbox"), kind: "checkbox", icon: PROPERTY_KIND_ICONS.checkbox },
	{ label: t("property.kind.date"), kind: "date", icon: PROPERTY_KIND_ICONS.date },
	{ label: t("property.kind.datetime"), kind: "datetime", icon: PROPERTY_KIND_ICONS.datetime },
];

/** 種類を選ぶ。Esc では null で解決し、何も追加しない。 */
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

/** 複数のノートには今のところリストの値しか書けないので、種類の選択ではほかを出さない。 */
function chooseNewKind(app: App, key: string, many: boolean): Promise<NewKind | null> {
	const items = many ? NEW_KIND_ITEMS.filter(({ kind }) => kind === "list") : NEW_KIND_ITEMS;
	return new Promise((resolve) => {
		new NewKindModal(t("property.placeholder.kind", { key }), app, items, resolve).open();
	});
}

/** ノートが持たないキーを追加する。種類を選び、その種類のとおりに値を編集する。 */
async function addNewProperty(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	key: string,
): Promise<PropertyEditOutcome> {
	// Why: エディターで Esc を押すと種類の選択に戻るので、何か書き込まれる前に種類を変えられる。
	// パレットはその間ずっと下で開いたままになる。
	for (;;) {
		const kind = await chooseNewKind(plugin.app, key, files.length > 1);
		if (!kind) return "stay";
		const outcome = await editNewKind(plugin, files, key, kind);
		if (outcome !== "dismissed") return outcome;
	}
}

/** 新しいキーの種類のエディターを実行する。閉じられたエディターは "dismissed" を返す。 */
async function editNewKind(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	key: string,
	kind: NewKind,
): Promise<PropertyEditOutcome | "dismissed"> {
	// 複数のノートにはリストの種類しか出さないので、ほかの種類は必ず1つのノートになる。
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
