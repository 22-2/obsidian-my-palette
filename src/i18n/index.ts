import messages from "./ja.json";

export type MessageKey = keyof typeof messages;
export type MessageParams = Record<string, string | number>;

/**
 * UI文言を ja.json から取り出し、{name} の部分を params で置き換える。
 * 対応する params がない {name} はそのまま残す。
 */
export function t(key: MessageKey, params: MessageParams = {}): string {
	return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	);
}
