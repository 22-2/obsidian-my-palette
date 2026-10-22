import type { PaletteResult } from "src/palette/results";

/**
 * 右矢印のプレビューに出せない結果の種類。
 * - command: 実行になる。
 * - mode-entry: モードに入るのはナビゲーション。
 * - search-history: 検索語を置き換える。
 * - property: 値の編集になる。
 * - plugin / snippet: 外部のエディターで開く。
 */
const NON_PREVIEWABLE_MODES: ReadonlySet<PaletteResult["mode"]> = new Set<PaletteResult["mode"]>([
	"command",
	"mode-entry",
	"search-history",
	"property",
	"plugin",
	"snippet",
]);

/**
 * 右矢印のプレビューに出せる結果かどうか。モーダルと常設のビューで同じ判定を使う。
 * プレビューは、対象を見せるだけで、パレットもフォーカスも動かさないのが約束。
 * そのため、実行や編集になってしまう結果は対象外にする。
 */
export function canPreviewResult(result: PaletteResult): boolean {
	return !NON_PREVIEWABLE_MODES.has(result.mode);
}
