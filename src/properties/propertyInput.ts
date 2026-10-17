import type { PropertyKind } from "src/palette/results";
import { formatPropertyValue } from "src/properties/propertyKind";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** 単一の値を入力して編集する種類。 */
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
 * 入力した値を、その種類について確認する。空の入力は常に受け付け、空の値として保存する。
 * そのためキーを削除せずに、値だけを消せる。
 */
export function checkPropertyInput(kind: InputPropertyKind, input: string): PropertyInputCheck {
	const value = input.trim();
	if (value === "") return { ok: true, value: "" };
	if (kind === "text") return { ok: true, value: input };
	if (kind === "number") {
		const number = Number(value);
		return Number.isFinite(number)
			? { ok: true, value: number }
			: { ok: false, reason: t("property.input.number") };
	}
	if (kind === "date") {
		const match = DATE_PATTERN.exec(value);
		return match && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
			? { ok: true, value }
			: { ok: false, reason: t("property.input.date") };
	}
	const match = DATETIME_PATTERN.exec(value);
	const valid =
		match !== null &&
		isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
		Number(match[4]) < 24 &&
		Number(match[5]) < 60 &&
		Number(match[6] ?? 0) < 60;
	return valid ? { ok: true, value } : { ok: false, reason: t("property.input.datetime") };
}

/** 入力の選択肢の1行。`value` がない行は選べない。 */
export interface PropertyInputRow {
	label: string;
	description: string;
	icon: string;
	/** 選べるとき、その行が書き込む値。 */
	value?: string | number;
}

/**
 * 入力された値の行: まず入力した値そのもの(書き込めないならその理由)、次に入力に一致する、
 * ほかのノートが使っている値。
 */
export function propertyInputRows(options: {
	kind: InputPropertyKind;
	query: string;
	current: unknown;
	vaultValues: readonly string[];
}): PropertyInputRow[] {
	const { kind, query, current, vaultValues } = options;
	const description = t("property.input.current", {
		value: formatPropertyValue(kind, current),
	});
	const check = checkPropertyInput(kind, query);
	const setRow: PropertyInputRow = check.ok
		? {
				label: t("property.input.setTo", { value: query }),
				description,
				icon: ICONS.check,
				value: check.value,
			}
		: { label: check.reason, description, icon: ICONS.error };
	const usable = vaultValues.flatMap((value) => {
		const usableCheck = checkPropertyInput(kind, value);
		return usableCheck.ok && usableCheck.value !== ""
			? [
					{
						label: value,
						description: t("property.input.usedInVault"),
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
