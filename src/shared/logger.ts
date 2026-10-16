import log, { LogLevels } from "consola";

/**
 * The plugin's one logger. Errors always reach the developer console; debug messages
 * appear only while the "Show log" setting is on.
 */
export const logger = log.withTag("MyPalette");

/** The `(message, detail)` callback that stores and clients take for their debug output. */
export const debugLog = (message: string, detail?: unknown): void => logger.debug(message, detail);

export function setDebugLogging(enabled: boolean): void {
	logger.level = enabled ? LogLevels.debug : LogLevels.error;
}
