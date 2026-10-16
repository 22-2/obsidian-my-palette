import type { PropertyKind } from "src/palette/results";
import { ICONS } from "src/ui/icons";

/** Keys whose type Obsidian fixes, so a stored type never changes how they are edited. */
const RESERVED_KINDS: Readonly<Record<string, PropertyKind>> = {
	tags: "tags",
	aliases: "list",
	cssclasses: "list",
};

/** Obsidian's names for a property type: the newer `widget` and the older `type`. */
const DECLARED_KINDS: Readonly<Record<string, PropertyKind>> = {
	text: ICONS.text,
	multitext: "list",
	number: "number",
	checkbox: "checkbox",
	date: "date",
	datetime: "datetime",
	// A declared `tags` type on another key is a plain list: Tag insertion writes only `tags`.
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
 * Works out how a property is shown and edited. A declared type is used when the
 * vault has one; otherwise the value decides. Nothing here changes the stored type.
 */
export function propertyKindOf(key: string, value: unknown, declaredType?: string): PropertyKind {
	const reserved = RESERVED_KINDS[key];
	if (reserved) return reserved;
	// Nested objects cannot be edited from a single value, whatever the type says.
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

/** The one-line text a row shows for a value. Lists are joined; nothing is edited here. */
export function formatPropertyValue(kind: PropertyKind, value: unknown): string {
	if (value === undefined || value === null || value === "") return "Not set";
	if (kind === "unsupported") return "{…}";
	if (Array.isArray(value)) return value.map(formatItem).join(", ");
	return formatItem(value);
}

function formatItem(value: unknown): string {
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
		? String(value)
		: "{…}";
}
