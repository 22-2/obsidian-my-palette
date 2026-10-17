import type { PropertyKind } from "src/palette/results";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** Obsidian が種類を固定しているキー。保存された種類が、編集のしかたを変えることはない。 */
const RESERVED_KINDS: Readonly<Record<string, PropertyKind>> = {
	tags: "tags",
	aliases: "list",
	cssclasses: "list",
};

/** Obsidian のプロパティの種類の名前。新しい `widget` と古い `type`。 */
const DECLARED_KINDS: Readonly<Record<string, PropertyKind>> = {
	text: ICONS.text,
	multitext: "list",
	number: "number",
	checkbox: "checkbox",
	date: "date",
	datetime: "datetime",
	// 別のキーで宣言された `tags` の種類は、ただのリスト。タグ挿入は `tags` キーだけを書く。
	tags: "list",
	aliases: "list",
	cssclasses: "list",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const PROPERTY_KIND_ICONS: Readonly<Record<PropertyKind, string>> = {
	text: ICONS.text,
	list: ICONS.list,
	number: ICONS.number,
	checkbox: ICONS.checkbox,
	date: ICONS.date,
	datetime: ICONS.datetime,
	tags: ICONS.tags,
	unsupported: ICONS.locked,
};

/**
 * プロパティの表示と編集のしかたを決める。Vault に宣言された種類があればそれを使い、なければ値が決める。
 * ここでは保存された種類は変えない。
 */
export function propertyKindOf(key: string, value: unknown, declaredType?: string): PropertyKind {
	const reserved = RESERVED_KINDS[key];
	if (reserved) return reserved;
	// 入れ子のオブジェクトは、種類が何と言っていても、1つの値では編集できない。
	if (isNestedObject(value)) return "unsupported";
	const declared = declaredType === undefined ? undefined : DECLARED_KINDS[declaredType];
	return declared ?? kindFromValue(value);
}

function kindFromValue(value: unknown): PropertyKind {
	if (value === undefined || value === null) return "text";
	if (Array.isArray(value)) return "list";
	if (typeof value === "boolean") return "checkbox";
	if (typeof value === "number") return "number";
	if (typeof value === "string") return kindFromString(value);
	return "unsupported";
}

function kindFromString(value: string): PropertyKind {
	if (DATE_PATTERN.test(value)) return "date";
	if (DATETIME_PATTERN.test(value)) return "datetime";
	return "text";
}

function isNestedObject(value: unknown): boolean {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 値を行に示す1行のテキスト。リストは連結する。ここでは編集しない。 */
export function formatPropertyValue(kind: PropertyKind, value: unknown): string {
	if (value === undefined || value === null || value === "") return t("property.value.notSet");
	if (kind === "unsupported") return "{…}";
	if (Array.isArray(value)) return value.map(formatItem).join(", ");
	return formatItem(value);
}

function formatItem(value: unknown): string {
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
		? String(value)
		: "{…}";
}
