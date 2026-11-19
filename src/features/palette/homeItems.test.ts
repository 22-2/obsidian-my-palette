import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import type { PaletteResult } from "src/core/results";
import { HomeItems, sortHomeItems } from "src/features/palette/homeItems";

function file(path: string): PaletteResult {
	return {
		id: `file:${path}`,
		mode: "file",
		vaultPath: path,
		primary: path,
		secondary: "",
		icon: "file",
	};
}

const mode: PaletteResult = {
	id: "mode:tags",
	mode: "mode-entry",
	modeId: "tags",
	primary: "Tags",
	secondary: "",
	icon: "tag",
	alias: "t",
};

describe("Home の並び", () => {
	it("ピンの順を優先し、残りはモードとファイルを一緒に履歴順にする", () => {
		const items = [file("a.md"), mode, file("b.md"), file("c.md")];
		expect(
			sortHomeItems(items, ["file:b.md", "mode:tags"], ["file:c.md", "file:a.md"]).map(
				(item) => item.id,
			),
		).toEqual(["file:b.md", "mode:tags", "file:c.md", "file:a.md"]);
	});

	it("ピンを追加順に並べ、上下移動、解除、ファイル名の変更を反映する", async () => {
		vi.spyOn(logger, "error").mockImplementation(() => undefined);
		const app = { vault: { adapter: {}, getName: () => "test" } } as unknown as App;
		const store = new HomeItems(app);
		await store.load(["old.md"]);
		store.togglePin("file:old.md");
		store.togglePin("mode:tags");
		store.movePin("mode:tags", -1);
		store.movePin("mode:tags", -1);
		store.renameFile("old.md", "new.md");
		expect(store.pinned).toEqual(["mode:tags", "file:new.md"]);
		expect(store.recents).toEqual(["file:new.md"]);
		store.togglePin("mode:tags");
		expect(store.pinned).toEqual(["file:new.md"]);
		await store.dispose();
		vi.restoreAllMocks();
	});
});
