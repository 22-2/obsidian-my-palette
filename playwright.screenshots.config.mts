import { defineObsidianConfig } from "obsidian-e2e-toolkit";
import base from "./playwright.config.mts";

// Screenshot specs live outside e2e/, so the regular e2e run does not pick them up.
export default defineObsidianConfig({
	...base,
	testDir: "./scripts/screenshots",
});
