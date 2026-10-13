import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mts";

// Screenshot specs live outside e2e/, so the regular e2e run does not pick them up.
export default defineConfig({
	...base,
	testDir: "./scripts/screenshots",
});
