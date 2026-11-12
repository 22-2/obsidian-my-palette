import log, { LogLevels } from "consola";

/**
 * プラグインのロガーは 1 つだけ。どの層もこれを直接 import して使い、関数として注入しない。
 * エラーは常に開発者コンソールに出し、デバッグ情報はログ表示の設定がオンのときだけ出す。
 *
 * - `logger.error`: 操作が失敗してユーザーに影響するとき。履歴などを保存できなくなったときも含む。
 * - `logger.debug`: 調査用の経過や、続行できる失敗（ファイル単位の一時的な読み取りエラーなど）。
 *
 * 例外は `{ error }` で包まず、最後の引数にそのまま渡す。スタックが整形されて出る。
 */
export const logger = log.withTag("MyPalette");

export function setDebugLogging(enabled: boolean): void {
	logger.level = enabled ? LogLevels.debug : LogLevels.error;
}
