import { afterEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { GitProvider } from "src/features/git/GitProvider";
import { listCommits } from "src/features/git/gitClient";

vi.mock("src/features/git/gitRepository", () => ({
	repositoryRoot: vi.fn().mockResolvedValue("root"),
}));
vi.mock("src/features/git/gitClient", () => ({ listCommits: vi.fn(), listChanges: vi.fn() }));

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe("GitProvider", () => {
	it("reuses recent history while typing and reloads it after expiration", async () => {
		vi.useFakeTimers();
		const commits = [
			{
				hash: "a".repeat(40),
				parents: [],
				date: "2026-11-20",
				author: "Test",
				subject: "first",
			},
		];
		vi.mocked(listCommits)
			.mockResolvedValueOnce(commits)
			.mockResolvedValueOnce([{ ...commits[0], hash: "b".repeat(40), subject: "second" }]);
		const provider = new GitProvider({} as App);
		expect((await provider.search({ mode: "git", query: "" }))[0].primary).toBe("first");
		expect((await provider.search({ mode: "git", query: "first" }))[0].primary).toBe("first");
		expect(listCommits).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(2_000);
		expect((await provider.search({ mode: "git", query: "" }))[0].primary).toBe("second");
		expect(listCommits).toHaveBeenCalledTimes(2);
	});
});
