import { LogLevels } from "consola";
import { describe, expect, it } from "vitest";
import { logger, setDebugLogging } from "src/shared/logger";

describe("setDebugLogging", () => {
	it("shows debug messages only while enabled, and errors either way", () => {
		setDebugLogging(true);
		expect(logger.level).toBe(LogLevels.debug);
		setDebugLogging(false);
		expect(logger.level).toBe(LogLevels.error);
	});
});
