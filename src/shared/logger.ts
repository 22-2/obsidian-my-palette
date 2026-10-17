import log, { LogLevels } from "consola";

/**
 * プラグインのロガーは 1 つだけ。エラーは常に開発者コンソールに出し、デバッグ情報は
 * ログ表示の設定がオンのときだけ出す。
 */
export const logger = log.withTag("MyPalette");

/** The `(message, detail)` callback that stores and clients take for their debug output. */
export const debugLog = (message: string, detail?: unknown): void => logger.debug(message, detail);

export function setDebugLogging(enabled: boolean): void {
	logger.level = enabled ? LogLevels.debug : LogLevels.error;
}
