import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.spec.mts",
	// One Obsidian instance per test file; keep the suite serial and readable.
	workers: 1,
	timeout: 60_000,
	reporter: [["list"]],
});
