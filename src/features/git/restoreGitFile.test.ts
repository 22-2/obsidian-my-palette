import { expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { GitFileResult } from "src/core/results";
import { restoreGitFile } from "src/features/git/restoreGitFile";
import { readVersionBytes } from "src/features/git/gitClient";
import { vaultPathFromAbsolute } from "src/features/ignored-notes/ignoredPaths";

vi.mock("src/features/ignored-notes/ignoredPaths", () => ({ vaultPathFromAbsolute: vi.fn() }));
vi.mock("src/features/git/gitClient", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/features/git/gitClient")>()),
	readVersionBytes: vi.fn(),
}));

it("restores deleted binary files to the vault root if their folder is gone", async () => {
	const parent = "a".repeat(40);
	const bytes = Buffer.from([0, 255, 128]);
	vi.mocked(readVersionBytes).mockResolvedValue(bytes);
	vi.mocked(vaultPathFromAbsolute).mockReturnValue("missing/image.bin");
	const createBinary = vi.fn().mockResolvedValue({ path: "restored" });
	const app = {
		vault: {
			getFolderByPath: () => null,
			adapter: { exists: async () => false },
			createBinary,
		},
	} as unknown as App;
	const result = {
		root: "repo",
		commit: { hash: "b".repeat(40), parents: [parent] },
		change: { path: "missing/image.bin", status: "D" },
	} as GitFileResult;
	await restoreGitFile(app, result);
	expect(readVersionBytes).toHaveBeenCalledWith("repo", parent, "missing/image.bin");
	expect(createBinary).toHaveBeenCalledOnce();
	expect(createBinary.mock.calls[0][0]).toBe("image (復元 aaaaaaaa).bin");
	expect(new Uint8Array(createBinary.mock.calls[0][1])).toEqual(new Uint8Array(bytes));
});
