import type { TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { getResultFilePath, type PaletteResult } from "src/palette/results";

const file = { path: "notes/a.md" } as TFile;
const base = { id: "id", primary: "p", secondary: "s", icon: "i" };

describe("結果のファイルパス取得", () => {
	const cases: Array<[string, PaletteResult, string | undefined]> = [
		["file", { ...base, mode: "file", vaultPath: "a.md" }, "a.md"],
		[
			"everything file",
			{
				...base,
				mode: "everything",
				absolutePath: "/x/a.md",
				vaultPath: "a.md",
				scope: "vault",
				kind: "file",
				attributes: "",
			},
			"a.md",
		],
		[
			"everything folder",
			{
				...base,
				mode: "everything",
				absolutePath: "/x",
				vaultPath: "x",
				scope: "vault",
				kind: "folder",
				attributes: "",
			},
			undefined,
		],
		["bookmark file", { ...base, mode: "bookmark", kind: "file", file }, "notes/a.md"],
		["bookmark search", { ...base, mode: "bookmark", kind: "search", query: "q" }, undefined],
		["link", { ...base, mode: "link", file, line: 1 }, "notes/a.md"],
		["backlink", { ...base, mode: "backlink", file, line: 1 }, "notes/a.md"],
		["smart", { ...base, mode: "smart", file, score: 1 }, "notes/a.md"],
		["command", { ...base, mode: "command", commandId: "c" }, undefined],
		[
			"plugin",
			{
				...base,
				mode: "plugin",
				pluginId: "alpha",
				absolutePath: "C:/vault/cfg/plugins/alpha",
				vaultPath: "cfg/plugins/alpha",
				enabled: true,
				hasSettings: true,
			},
			undefined,
		],
		[
			"snippet",
			{
				...base,
				mode: "snippet",
				snippetName: "alpha.css",
				absolutePath: "C:/vault/cfg/snippets/alpha.css",
				vaultPath: "cfg/snippets/alpha.css",
				isFolder: false,
				enabled: true,
			},
			undefined,
		],
	];

	it.each(cases)("%s", (_name, result, expected) => {
		expect(getResultFilePath(result)).toBe(expected);
	});
});
