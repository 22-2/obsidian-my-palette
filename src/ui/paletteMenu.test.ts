import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { PaletteMenu, placeMenu, type PaletteMenuItem } from "src/ui/paletteMenu";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"HTMLElement",
		"Event",
		"KeyboardEvent",
		"MouseEvent",
		"PointerEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function sample() {
	const menu = new PaletteMenu();
	const run = vi.fn();
	menu.addItem((item) => item.setTitle("Open").setIcon("file").onClick(run));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle("Disabled").setDisabled(true).onClick(vi.fn()));
	menu.addItem((item) => item.setTitle("Help").onClick(vi.fn()));
	return { menu, run };
}

function titleOf(element: Element | null): string | null {
	return element?.querySelector(".menu-item-title")?.textContent ?? null;
}

function itemNamed(title: string): HTMLElement {
	const item = [...document.querySelectorAll<HTMLElement>(".menu-item")].find(
		(element) => titleOf(element) === title,
	);
	if (!item) throw new Error(`no menu item: ${title}`);
	return item;
}

function titleOfItem(item: PaletteMenuItem): string {
	return titleOf(item.dom) ?? "";
}

function selectedTitle(): string | null {
	return titleOf(document.querySelector(".menu-item.selected"));
}

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe("パレットメニューのマークアップ", () => {
	it("Obsidian のメニュー クラスを使用し、グループを分離します", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 10, y: 20 });

		expect(document.querySelectorAll(".menu > .menu-scroll > .menu-group")).toHaveLength(2);
		expect(document.querySelectorAll(".menu > .menu-scroll > .menu-separator")).toHaveLength(1);
		expect(itemNamed("Open").querySelector(".menu-item-icon")).not.toBeNull();
		expect(itemNamed("Disabled").classList.contains("is-disabled")).toBe(true);
	});

	it("前に項目がないセパレータを削除します", () => {
		const menu = new PaletteMenu();
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Only"));
		menu.addSeparator();
		menu.addSeparator();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.querySelectorAll(".menu-separator")).toHaveLength(1);
	});

	it("アイテムのチェック済み状態と警告状態を示します", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("On").setChecked(true));
		menu.addItem((item) => item.setTitle("Remove").setWarning(true));
		menu.showAtPosition({ x: 0, y: 0 });

		expect(itemNamed("On").classList.contains("mod-checked")).toBe(true);
		expect(itemNamed("On").querySelector(".mod-checked")).not.toBeNull();
		expect(itemNamed("Remove").classList.contains("is-warning")).toBe(true);
	});

	it("両方の状態でスイッチを描画し、キーボードの選択から見出しを除外します。", () => {
		const menu = new PaletteMenu();
		menu.addHeading("Options");
		menu.addItem((item) => item.setTitle("Off").setSwitch(false));
		menu.addItem((item) => item.setTitle("On").setSwitch(true).setTooltip("Explains it"));
		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });

		expect(document.querySelector(".my-palette-menu-heading")?.textContent).toBe("Options");
		expect(document.querySelector(".menu-item.selected")).toBe(itemNamed("Off"));
		expect(itemNamed("Off").querySelector(".my-palette-menu-switch")).not.toBeNull();
		expect(itemNamed("Off").querySelector(".is-enabled")).toBeNull();
		expect(itemNamed("Off").getAttribute("aria-checked")).toBe("false");
		expect(itemNamed("On").querySelector(".my-palette-menu-switch.is-enabled")).not.toBeNull();
		expect(itemNamed("On").getAttribute("role")).toBe("menuitemcheckbox");
		expect(itemNamed("On").getAttribute("aria-label")).toBe("Explains it");
	});

	it("メニューの役割とチェックされた状態と無効な状態を支援技術に公開します", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("Plain"));
		menu.addItem((item) => item.setTitle("Checked").setChecked(false).setDisabled(true));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Last"));
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.querySelector(".menu")?.getAttribute("role")).toBe("menu");
		expect(itemNamed("Plain").getAttribute("role")).toBe("menuitem");
		expect(itemNamed("Checked").getAttribute("role")).toBe("menuitemcheckbox");
		expect(itemNamed("Checked").getAttribute("aria-checked")).toBe("false");
		expect(itemNamed("Checked").getAttribute("aria-disabled")).toBe("true");
		expect(document.querySelector(".menu-separator")?.getAttribute("role")).toBe("separator");
	});

	it("要求されている間のみ項目を行動喚起としてマークします。", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("Clear").setWarning(true).setCta());
		menu.showAtPosition({ x: 0, y: 0 });
		expect(itemNamed("Clear").classList.contains("mod-cta")).toBe(true);

		menu.close();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(itemNamed("Clear").classList.contains("mod-cta")).toBe(true);
	});
});

describe("パレットメニューのクリック数", () => {
	it("項目を実行してメニューを閉じます", () => {
		const { menu, run } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Open").click();

		expect(run).toHaveBeenCalledTimes(1);
		expect(document.querySelector(".menu")).toBeNull();
		expect(onHide).toHaveBeenCalledTimes(1);
	});

	it("開いたままにする項目のメニューを開いたままにし、そのタイトルを更新します", () => {
		const menu = new PaletteMenu();
		let clear!: { setTitle(title: string): unknown };
		menu.addItem((item) => {
			clear = item
				.setTitle("Clear search history")
				.setWarning(true)
				.setKeepOpen()
				.onClick(() => clear.setTitle("Click again to clear"));
		});
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Clear search history").click();

		expect(document.querySelector(".menu")).not.toBeNull();
		expect(titleOf(document.querySelector(".menu"))).toBe("Click again to clear");
	});

	it("2 回目に押すと確認済みの項目が実行され、メニューが閉じます", () => {
		const menu = new PaletteMenu();
		const run = vi.fn();
		menu.addConfirmedItem({
			title: "Move to trash",
			confirmTitle: "Click again to move 2 files to trash",
			icon: "trash-2",
			run,
		});
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Move to trash").click();
		expect(run).not.toHaveBeenCalled();
		expect(document.querySelector(".menu .menu-item.mod-cta.is-warning")).not.toBeNull();

		itemNamed("Click again to move 2 files to trash").click();
		expect(run).toHaveBeenCalledTimes(1);
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("別の項目が選択されると確認をキャンセルします", () => {
		const menu = new PaletteMenu();
		const run = vi.fn();
		menu.addItem((item) => item.setTitle("Open").onClick(vi.fn()));
		menu.addConfirmedItem({
			title: "Clear search history",
			confirmTitle: "Click again to clear",
			icon: "trash-2",
			run,
		});
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Clear search history").click();
		press("ArrowDown");
		expect(document.querySelector(".menu .mod-cta")).toBeNull();
		itemNamed("Clear search history").click();
		expect(run).not.toHaveBeenCalled();
	});

	it("無効なアイテムのクリックを無視します", () => {
		const { menu, run } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Disabled").click();

		expect(document.querySelector(".menu")).not.toBeNull();
		expect(onHide).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it("外側のプレスにクローズし、内側のプレスに集中し続ける", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		const inside = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
		itemNamed("Open").querySelector(".menu-item-title")?.dispatchEvent(inside);
		expect(inside.defaultPrevented).toBe(true);
		expect(document.querySelector(".menu")).not.toBeNull();

		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
		expect(document.querySelector(".menu")).toBeNull();
	});
});

describe("パレットメニューキーボード", () => {
	it("矢印で無効な項目を通過して回り込みます", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		press("ArrowDown");
		expect(selectedTitle()).toBe("Open");
		press("ArrowDown");
		expect(selectedTitle()).toBe("Help");
		press("ArrowDown");
		expect(selectedTitle()).toBe("Open");
		press("ArrowUp");
		expect(selectedTitle()).toBe("Help");
	});

	it("Home と End を使用して最初と最後の有効な項目にジャンプします", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		press("End");
		expect(selectedTitle()).toBe("Help");
		press("Home");
		expect(selectedTitle()).toBe("Open");
	});

	it("Enter キーで選択した項目を実行し、キーを停止します", () => {
		const { menu, run } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");

		const event = press("Enter");

		expect(run).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("開いたままにする項目で Enter を押した後もメニューを開いたままにします", () => {
		const menu = new PaletteMenu();
		const run = vi.fn();
		menu.addItem((item) => item.setTitle("Toggle").setKeepOpen().onClick(run));
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");

		press("Enter");
		press("Enter");

		expect(run).toHaveBeenCalledTimes(2);
		expect(document.querySelector(".menu")).not.toBeNull();
	});

	it("Escape で閉じてパレット入力からキーを保持します", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		input.focus();
		const seen = vi.fn();
		input.addEventListener("keydown", seen);
		menu.showAtPosition({ x: 0, y: 0 });

		const event = press("Escape", input);

		expect(document.querySelector(".menu")).toBeNull();
		expect(event.defaultPrevented).toBe(true);
		expect(seen).not.toHaveBeenCalled();
	});

	it("selectFirst で開いた場合にのみ、最初の有効な項目を選択します", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(selectedTitle()).toBeNull();
		menu.hide();

		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });
		expect(selectedTitle()).toBe("Open");
	});

	it("ポインタの下で有効な項目は選択されますが、無効な項目は選択されません", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Disabled").dispatchEvent(new Event("pointerover", { bubbles: true }));
		expect(selectedTitle()).toBeNull();
		itemNamed("Help").dispatchEvent(new Event("pointerover", { bubbles: true }));
		expect(selectedTitle()).toBe("Help");
	});
});

describe("パレットメニューの非表示", () => {
	it("close() は、 hide() と同じ方法でメニューを非表示にします。", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		menu.close();
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("onHide は閉じたときに 1 回呼び出されますが、再度開いたときは呼び出されません", () => {
		const { menu } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });
		menu.showAtPosition({ x: 5, y: 5 });
		expect(onHide).not.toHaveBeenCalled();
		expect(document.querySelectorAll(".menu")).toHaveLength(1);

		menu.close();
		expect(onHide).toHaveBeenCalledTimes(1);
		menu.close();
		expect(onHide).toHaveBeenCalledTimes(1);
	});
});

describe("パレットメニュー選択", () => {
	it("選択された項目は報告しますが、メニューが閉じたときは何も報告しません", () => {
		const { menu } = sample();
		const selected: Array<string | undefined> = [];
		menu.onSelectionChange((item) => selected.push(item ? titleOfItem(item) : undefined));
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");
		press("ArrowDown");
		menu.close();

		expect(selected).toEqual(["Open", "Help", undefined]);
	});
});

const keymap = { pushScope: vi.fn(), popScope: vi.fn() };

function filterMenu(minItems = 3) {
	const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, minItems);
	const runs = { copy: vi.fn(), open: vi.fn(), rename: vi.fn() };
	menu.addItem((item) => item.setTitle("Open in terminal").onClick(runs.open));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle("Copy file name").onClick(runs.copy));
	menu.addItem((item) => item.setTitle("Rename…").onClick(runs.rename));
	return { menu, runs };
}

function filterInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>(".my-palette-menu-filter__input");
	if (!input) throw new Error("no filter input");
	return input;
}

function type(text: string): void {
	const input = filterInput();
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function visibleTitles(): string[] {
	return [...document.querySelectorAll<HTMLElement>(".menu-item:not(.is-filtered)")].map(
		(element) => titleOf(element) ?? "",
	);
}

describe("パレットメニューフィルター", () => {
	it("日本語のタイトルと英語のアクション ID を大文字と小文字を区別せずに一致させます。", () => {
		const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, 1);
		const run = vi.fn();
		menu.addItem((item) =>
			item.setTitle("名前をコピー").setSearchTerms("copy-file-name").onClick(run),
		);
		menu.addItem((item) => item.setTitle("開く").setSearchTerms("open"));
		menu.showAtPosition({ x: 0, y: 0 });

		type("名前 COPY-FILE");
		expect(visibleTitles()).toEqual(["名前をコピー"]);
		press("Enter", filterInput());
		expect(run).toHaveBeenCalledOnce();
	});

	it("開いたときにフォーカスが取得されるため、入力がパレット入力に到達することはありません", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.activeElement).toBe(filterInput());
	});

	it("開いている間は独自のキーマップ スコープを保持するため、モーダルはフォーカスを戻すことができません", () => {
		keymap.pushScope.mockClear();
		keymap.popScope.mockClear();
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(keymap.pushScope).toHaveBeenCalledOnce();

		menu.close();
		expect(keymap.popScope).toHaveBeenCalledExactlyOnceWith(keymap.pushScope.mock.calls[0][0]);
	});

	it("フィールドを表示するには短すぎるメニューのスコープをプッシュしません", () => {
		keymap.pushScope.mockClear();
		const { menu } = filterMenu(4);
		menu.showAtPosition({ x: 0, y: 0 });
		expect(keymap.pushScope).not.toHaveBeenCalled();
	});

	it("大文字と小文字を無視して、入力された単語が欠落しているアクションを非表示にします", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("FILE na");
		expect(visibleTitles()).toEqual(["Copy file name"]);
		type("");
		expect(visibleTitles()).toEqual(["Open in terminal", "Copy file name", "Rename…"]);
	});

	it("最初の一致を選択し、Enter でそれを実行します", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("e");
		expect(selectedTitle()).toBe("Open in terminal");
		press("ArrowDown", filterInput());
		press("Enter", filterInput());

		expect(runs.copy).toHaveBeenCalledOnce();
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("何も一致しない場合は空のメッセージを表示します", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("zzz");
		expect(document.querySelector(".my-palette-menu-empty.is-visible")).not.toBeNull();
		expect(selectedTitle()).toBeNull();
		type("");
		expect(document.querySelector(".my-palette-menu-empty.is-visible")).toBeNull();
	});

	it("Space と Home がメニューで動作するのではなく、テキスト フィールドにアクセスできるようにします。", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("e");

		expect(press(" ", filterInput()).defaultPrevented).toBe(false);
		expect(press("Home", filterInput()).defaultPrevented).toBe(false);
		expect(runs.open).not.toHaveBeenCalled();
	});

	it("フィールドが空のときにスペースを使用して選択した項目をアクティブにします", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown", filterInput());

		expect(press(" ", filterInput()).defaultPrevented).toBe(true);
		expect(runs.open).toHaveBeenCalledOnce();
	});

	it("全角スペースをスペースと同じように扱います", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown", filterInput());

		expect(press("　", filterInput()).defaultPrevented).toBe(true);
		expect(runs.open).toHaveBeenCalledOnce();
	});

	it("何も選択されていない場合でも、スペースをフィールドから遠ざけます", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(press(" ", filterInput()).defaultPrevented).toBe(true);
		expect(filterInput().value).toBe("");
		expect(runs.open).not.toHaveBeenCalled();
	});

	it("メニューが再度表示されると単語をクリアします", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("rename");
		menu.close();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(filterInput().value).toBe("");
		expect(visibleTitles()).toHaveLength(3);
	});

	it("メニューのアクションが最小値よりも少ない場合、フィールドをスキップします。", () => {
		const { menu } = filterMenu(4);
		menu.showAtPosition({ x: 0, y: 0 });

		expect(filterInput().closest(".my-palette-menu-filter")?.hasAttribute("hidden")).toBe(true);
		expect(document.activeElement).not.toBe(filterInput());
	});

	it("フィールドをクリックしてもフォーカスが盗まれたり失われないようにします", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
		filterInput().dispatchEvent(press);

		expect(press.defaultPrevented).toBe(false);
	});
});

describe("パレットメニューのフォーカスと配置", () => {
	it("開く前に持っていた要素にフォーカスを戻します", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		input.focus();
		menu.showAtPosition({ x: 0, y: 0 });
		(document.activeElement as HTMLElement).blur();

		press("Escape");

		expect(document.activeElement).toBe(input);
	});

	it("ユーザーが別の入力に移動したフォーカスを維持します", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		const other = document.body.appendChild(createEl("input"));
		input.focus();
		menu.showAtPosition({ x: 0, y: 0 });
		other.focus();

		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

		expect(document.activeElement).toBe(other);
	});

	it("与えられたドキュメントを開きます", () => {
		const { menu } = sample();
		const popout = new Window();
		menu.showAtPosition({ x: 0, y: 0 }, { doc: popout.document as unknown as Document });

		expect(popout.document.querySelector(".menu")).not.toBeNull();
		expect(document.querySelector(".menu")).toBeNull();
	});
});

describe("場所メニュー", () => {
	const viewport = { width: 500, height: 500 };
	const size = { width: 100, height: 50 };

	it("ポインタがぴったりと合うと、そのすぐ下と右が開きます", () => {
		expect(placeMenu({ x: 10, y: 20 }, size, viewport)).toEqual({ left: 12, top: 22 });
	});

	it("右端近くでポインタの左側に反転します", () => {
		expect(placeMenu({ x: 450, y: 20 }, size, viewport).left).toBe(348);
	});

	it("下端付近でポインタの上を反転します", () => {
		expect(placeMenu({ x: 10, y: 470 }, size, viewport).top).toBe(418);
	});

	it("上端または左端を越えることはありません", () => {
		expect(
			placeMenu({ x: 10, y: 10 }, { width: 300, height: 300 }, { width: 100, height: 100 }),
		).toEqual({
			left: 0,
			top: 0,
		});
	});
});
