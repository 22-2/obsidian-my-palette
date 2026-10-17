import { defineObsidianConfig } from "obsidian-e2e-toolkit";

export default defineObsidianConfig({
	testDir: "e2e",
	testMatch: "**/*.spec.mts",
	// The offstage CLI shares one hidden desktop per run, so Windows uses one worker
	// to keep Obsidian windows from competing for focus. Other platforms run in parallel.
	workers: process.platform === "win32" ? 1 : process.env.CI ? 3 : 2,
	// Retry once on CI so a slow runner does not fail the job; a test that needs it is reported as flaky.
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	reporter: [["list"]],
});
