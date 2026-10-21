import { describe, expect, it, vi } from "vitest";
import { win32 } from "node:path";
import { EverythingProvider } from "src/search/everything/EverythingProvider";
import { DEFAULT_SETTINGS } from "src/settings/model";
import type { EverythingResult } from "src/palette/results";

vi.mock("obsidian", () => ({
	TFile: class TFile {},
	normalizePath: (path: string) => path.replaceAll("\\", "/"),
}));
const { TFile } = await import("obsidian");

const result = (absolutePath: string, kind: "file" | "folder" = "file"): EverythingResult => ({
	id: absolutePath.toLowerCase(),
	mode: "everything",
	primary: absolutePath.split("\\").at(-1)!,
	secondary: "C:\\Vault",
	icon: kind,
	absolutePath,
	scope: "directory",
	attributes: "",
	kind,
});

describe("EverythingProvider", () => {
	it("filters vault results and applies extension and result limits", async () => {
		const files = [new TFile(), new TFile()];
		files[0].path = "one.md";
		files[0].extension = "md";
		files[1].path = "two.txt";
		files[1].extension = "txt";
		const settings = {
			...structuredClone(DEFAULT_SETTINGS.everything),
			maxResults: 1,
			vaultExtensions: ["md"],
		};
		const search = vi
			.fn()
			.mockResolvedValue([
				result("C:\\Vault\\one.md"),
				result("C:\\Vault\\two.txt"),
				result("C:\\Vault\\.hidden.md"),
				result("D:\\outside.md"),
				result("C:\\Vault\\folder", "folder"),
			]);
		const app = {
			vault: {
				adapter: { getBasePath: () => "C:\\Vault", path: win32 },
				getConfig: () => [],
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p),
			},
		};
		const provider = new EverythingProvider(app as never, { search } as never, () => settings);
		const found = await provider.search({ mode: "everything", query: "one" });
		expect(search.mock.calls[0]?.[0]).toContain("ext:md");
		expect(found.map((item) => item.vaultPath)).toEqual(["one.md"]);
	});

	it("allows non-Markdown directory results and excludes configured folders", async () => {
		const settings = structuredClone(DEFAULT_SETTINGS.everything);
		const search = vi
			.fn()
			.mockResolvedValue([
				result("C:\\Vault\\image.png"),
				result("C:\\Vault\\blocked\\x.png"),
			]);
		const provider = new EverythingProvider(
			{
				vault: {
					adapter: { getBasePath: () => "C:\\Vault", path: win32 },
					getConfig: () => [],
				},
			} as never,
			{ search } as never,
			() => settings,
			() => ["blocked"],
		);
		const found = await provider.search({
			mode: "everything",
			query: "*.png",
			everythingScope: "directory",
		});
		expect(search.mock.calls[0]?.[0]).not.toContain("ext:");
		expect(found.map((item) => item.vaultPath)).toEqual(["image.png"]);
	});

	it("reports unsupported vault adapters", async () => {
		const provider = new EverythingProvider(
			{ vault: { adapter: {} } } as never,
			{} as never,
			() => DEFAULT_SETTINGS.everything,
		);
		await expect(provider.search({ mode: "everything", query: "x" })).rejects.toThrow(
			"解決できません",
		);
	});

	it("hides vault files Obsidian cannot open only when the openable filter is on", async () => {
		const files = [new TFile(), new TFile()];
		files[0].path = "one.md";
		files[0].extension = "md";
		files[1].path = "two.toml";
		files[1].extension = "toml";
		const extensionless = new TFile();
		extensionless.path = "LICENSE";
		extensionless.extension = "";
		files.push(extensionless);
		const settings = {
			...structuredClone(DEFAULT_SETTINGS.everything),
			vaultExtensions: ["md", "toml", ""],
		};
		const search = vi
			.fn()
			.mockResolvedValue([
				result("C:\\Vault\\one.md"),
				result("C:\\Vault\\two.toml"),
				result("C:\\Vault\\LICENSE"),
			]);
		const app = {
			vault: {
				adapter: { getBasePath: () => "C:\\Vault", path: win32 },
				getConfig: () => [],
				getAbstractFileByPath: (p: string) => files.find((f) => f.path === p),
			},
			// 空の拡張子でも登録ありと答える内部を想定し、拡張子なしが除外されることを確かめる。
			viewRegistry: {
				isExtensionRegistered: (extension: string) =>
					extension === "md" || extension === "",
			},
		};
		const off = new EverythingProvider(app as never, { search } as never, () => settings);
		expect(
			(await off.search({ mode: "everything", query: "x" })).map((r) => r.vaultPath),
		).toEqual(["one.md", "two.toml", "LICENSE"]);
		const on = new EverythingProvider(
			app as never,
			{ search } as never,
			() => settings,
			undefined,
			() => true,
		);
		expect(
			(await on.search({ mode: "everything", query: "x" })).map((r) => r.vaultPath),
		).toEqual(["one.md"]);
	});
});
