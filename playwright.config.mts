import { defineObsidianConfig } from "obsidian-e2e-toolkit";

export default defineObsidianConfig({
	testDir: "e2e",
	testMatch: "**/*.spec.mts",
	// Each test launches its own Obsidian with an isolated vault, so files run in parallel.
	// GitHub's Linux runners have 4 vCPUs and can take three; a local machine keeps two.
	workers: process.env.CI ? 3 : 2,
	// Retry once on CI so a slow runner does not fail the job; a test that needs it is reported as flaky.
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	reporter: [["list"]],
});
