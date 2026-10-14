import { expect, test as base } from "obsidian-e2e-toolkit";

export { expect };
export const test = base.extend({
	coverageOptions: { enabled: process.env.E2E_COVERAGE === "1", outputDir: "coverage/e2e" },
});
export type { ObsidianAPI } from "obsidian-e2e-toolkit";
