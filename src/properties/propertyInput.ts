import type { PropertyKind } from "src/palette/results";
import { formatPropertyValue } from "src/properties/propertyKind";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";

/** The kinds edited by typing a single value. */
export type InputPropertyKind = Extract<PropertyKind, "text" | "number" | "date" | "datetime">;

export type PropertyInputCheck =
	| { ok: true; value: string | number }
	| { ok: false; reason: string };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function isCalendarDate(year: number, month: number, day: number): boolean {
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Checks a typed value for its property kind. Empty input is always accepted and
 * stored as an empty value, so a value can be cleared without removing its key.
 */
export function checkPropertyInput(kind: InputPropertyKind, input: string): PropertyInputCheck {
	const value = input.trim();
	if (value === "") return { ok: true, value: "" };
	if (kind === "text") return { ok: true, value: input };
	if (kind === "number") {
		const number = Number(value);
		return Number.isFinite(number)
			? { ok: true, value: number }
			: { ok: false, reason: "Enter a number." };
	}
	if (kind === "date") {
		const match = DATE_PATTERN.exec(value);
		return match && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
			? { ok: true, value }
			: { ok: false, reason: "Enter a date as YYYY-MM-DD." };
	}
	const match = DATETIME_PATTERN.exec(value);
	const valid =
		match !== null &&
		isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
		Number(match[4]) < 24 &&
		Number(match[5]) < 60 &&
		Number(match[6] ?? 0) < 60;
	return valid
		? { ok: true, value }
		: { ok: false, reason: "Enter a date and time as YYYY-MM-DDTHH:mm." };
}

/** One row of the input selector; a row without `value` cannot be chosen. */
export interface PropertyInputRow {
	label: string;
	description: string;
	icon: string;
	/** The value the row writes, when the row can be chosen. */
	value?: string | number;
}

/**
 * The rows for the typed input: the typed value itself first (or the reason it cannot
 * be written), then the values other notes use that match the input.
 */
export function propertyInputRows(options: {
	kind: InputPropertyKind;
	query: string;
	current: unknown;
	vaultValues: readonly string[];
}): PropertyInputRow[] {
	const { kind, query, current, vaultValues } = options;
	const description = `Current: ${formatPropertyValue(kind, current)}`;
	const check = checkPropertyInput(kind, query);
	const setRow: PropertyInputRow = check.ok
		? { label: `Set to "${query}"`, description, icon: ICONS.check, value: check.value }
		: { label: check.reason, description, icon: ICONS.error };
	const usable = vaultValues.flatMap((value) => {
		const usableCheck = checkPropertyInput(kind, value);
		return usableCheck.ok && usableCheck.value !== ""
			? [
					{
						label: value,
						description: "Used in the vault",
						icon: ICONS.list,
						value: usableCheck.value,
					},
				]
			: [];
	});
	const matched = query.trim()
		? searchFuzzyQuery(query, usable, [(row) => row.label]).map(({ obj }) => obj)
		: usable;
	return [setRow, ...matched];
}
