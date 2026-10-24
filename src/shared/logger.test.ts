import { LogLevels } from "consola";
import { describe, expect, it } from "vitest";
import { logger, setDebugLogging } from "src/shared/logger";

describe("デバッグログの設定", () => {
	it("有効な場合のみデバッグ メッセージを表示し、どちらの場合でもエラーを表示します", () => {
		setDebugLogging(true);
		expect(logger.level).toBe(LogLevels.debug);
		setDebugLogging(false);
		expect(logger.level).toBe(LogLevels.error);
	});
});
