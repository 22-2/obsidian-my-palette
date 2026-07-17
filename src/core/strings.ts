const regEmoji = new RegExp(
	// biome-ignore lint/suspicious/noMisleadingCharacterClass: <explanation>
	/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|[\uFE0E-\uFE0F]/,
	"g",
);

/**
 * 半角スペースを除外します
 */
export function excludeSpace(text: string): string {
	return text.replace(/ /g, "");
}

/**
 * 絵文字を除外します
 */
export function excludeEmoji(text: string): string {
	return text.replace(regEmoji, "");
}

export type FuzzyResult =
	| { type: "starts-with"; score: number }
	| { type: "includes"; score: number }
	| { type: "fuzzy"; score: number }
	| { type: "none"; score: number };

/**
 * 最小限のファジーマッチを行います
 */
export function microFuzzy(value: string, query: string): FuzzyResult {
	if (value.startsWith(query)) {
		return { type: "starts-with", score: 2 ** query.length / value.length };
	}
	const emojiLessValue = excludeEmoji(value);
	if (emojiLessValue.startsWith(query)) {
		return { type: "starts-with", score: 2 ** query.length / value.length };
	}

	if (value.includes(query)) {
		return { type: "includes", score: 2 ** query.length / value.length };
	}

	let i = 0;
	let scoreSeed = 0;
	let combo = 0;
	for (let j = 0; j < emojiLessValue.length; j++) {
		if (emojiLessValue[j] === query[i]) {
			combo++;
			i++;
		} else {
			if (combo > 0) {
				scoreSeed += 2 ** combo;
				combo = 0;
			}
		}
		if (i === query.length) {
			if (combo > 0) {
				scoreSeed += 2 ** combo;
			}
			return { type: "fuzzy", score: scoreSeed / value.length };
		}
	}

	return { type: "none", score: 0 };
}
