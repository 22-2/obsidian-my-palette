import type { EverythingScope, ParsedInput, PaletteMode } from "src/palette/results";
import type { ModeSettingsMap, SearchHistoryCategory } from "src/settings/model";
import { paletteModeAlias } from "src/palette/modes";

/**
 * Home の前のパレットと同じように、接頭辞付きの入力を読む。パレットは今では
 * `src/palette/modes` を通じてモードに入る。これは、カテゴリなしで保存された履歴の行のために残す。
 */
export function parseInput(raw: string, modes: ModeSettingsMap): ParsedInput {
	const lower = raw.toLocaleLowerCase();
	// 廃止されたエイリアスは、保存済みの履歴のためだけに読む。モードに入る操作では読まない。
	const directoryAlias = "esdir";
	if (lower === directoryAlias.toLocaleLowerCase()) {
		// Why: フォルダー全体のエイリアスは、クエリなしの検索として役立つ。末尾の空白を
		// 必須にすると、ユーザーがさらに打つまでは普通のファイル検索に見えてしまうため。
		return {
			raw,
			mode: "everything",
			query: "",
			everythingScope: "directory",
		};
	}
	const candidates: Array<{
		prefix: string;
		mode: PaletteMode;
		everythingScope?: EverythingScope;
	}> = [
		{ prefix: `${paletteModeAlias("notes", modes)} `, mode: "file" },
		{ prefix: `${paletteModeAlias("commands", modes)} `, mode: "command" },
		{ prefix: `${paletteModeAlias("outlinks", modes)} `, mode: "link" },
		{ prefix: `${paletteModeAlias("backlinks", modes)} `, mode: "backlink" },
		{ prefix: `${paletteModeAlias("bookmarks", modes)} `, mode: "bookmark" },
		{ prefix: `${paletteModeAlias("smart", modes)} `, mode: "smart" },
		{ prefix: `${paletteModeAlias("tabs", modes)} `, mode: "tab" },
		{
			prefix: `${directoryAlias} `,
			mode: "everything",
			everythingScope: "directory",
		},
		{
			prefix: `${paletteModeAlias("everything", modes)} `,
			mode: "everything",
			everythingScope: "vault",
		},
	];
	candidates.sort((a, b) => b.prefix.length - a.prefix.length);
	for (const candidate of candidates) {
		if (candidate.prefix && lower.startsWith(candidate.prefix.toLocaleLowerCase())) {
			return {
				raw,
				mode: candidate.mode,
				query: raw.slice(candidate.prefix.length).replace(/^\s+/, ""),
				everythingScope: candidate.everythingScope,
			};
		}
	}
	return { raw, mode: "file", query: raw };
}

export function getSearchHistoryCategory(
	input: Pick<ParsedInput, "mode" | "everythingScope">,
): SearchHistoryCategory {
	if (input.mode === "everything" && input.everythingScope === "directory")
		return "everything-directory";
	return input.mode;
}
