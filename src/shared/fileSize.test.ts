import { describe, expect, it } from "vitest";
import { formatSize } from "src/shared/fileSize";

describe("formatSize", () => {
	it("uses bytes below 1 KB and one decimal below 10 units", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(1023)).toBe("1023 B");
		expect(formatSize(1536)).toBe("1.5 KB");
		expect(formatSize(20 * 1024)).toBe("20 KB");
		expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
	});
});
