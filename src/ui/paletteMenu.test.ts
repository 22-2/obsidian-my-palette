import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { PaletteMenu, placeMenu, placeSubmenu, type PaletteMenuItem } from "src/ui/paletteMenu";
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
	it("項目名にアクセスキーを表示し、そのキーで実行します", () => {
		const menu = new PaletteMenu();
		const run = vi.fn();
		menu.addItem((item) => item.setTitle("Copy id").setAccessKey("i").onClick(run));
		menu.showAtPosition({ x: 0, y: 0 });

		expect(titleOf(document.querySelector(".menu-item"))).toBe("Copy id (I)");
		const event = press("i");
		expect(run).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(true);
	});

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

	it("入力モードのスペースは、メニューで動作するのではなく、テキスト フィールドに入ります。", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("e");

		expect(press(" ", filterInput()).defaultPrevented).toBe(false);
		expect(runs.open).not.toHaveBeenCalled();
	});

	it("Home と End は入力中でもメニューの先頭と末尾へ移動する", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(press("End", filterInput()).defaultPrevented).toBe(true);
		expect(selectedTitle()).toBe("Rename…");
		press("Home", filterInput());
		expect(selectedTitle()).toBe("Open in terminal");
	});

	describe("入力モードと選択モード", () => {
		function keyedMenu() {
			const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, 2);
			const runs = { open: vi.fn(), copy: vi.fn() };
			menu.addItem((item) => item.setTitle("Open").setAccessKey("o").onClick(runs.open));
			menu.addItem((item) => item.setTitle("Copy name").setAccessKey("n").onClick(runs.copy));
			menu.addItem((item) => item.setTitle("Rename").onClick(vi.fn()));
			return { menu, runs };
		}

		it("入力モードで始まり、キーは絞り込みに入って表示も出さない", () => {
			const { menu, runs } = keyedMenu();
			menu.showAtPosition({ x: 0, y: 0 });

			expect(filterInput().readOnly).toBe(false);
			expect(visibleTitles()).toEqual(["Open", "Copy name", "Rename"]);
			press("o", filterInput());
			expect(runs.open).not.toHaveBeenCalled();
		});

		it("↓ で選択モードに入り、アクセスキーを表示して、そのキーで実行する", () => {
			const { menu, runs } = keyedMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown", filterInput());

			expect(filterInput().readOnly).toBe(true);
			expect(visibleTitles()).toEqual(["Open (O)", "Copy name (N)", "Rename"]);
			expect(press("n", filterInput()).defaultPrevented).toBe(true);
			expect(runs.copy).toHaveBeenCalledOnce();
		});

		it("選択モードで先頭の項目から ↑ を押すと入力モードへ戻る", () => {
			const { menu } = keyedMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown", filterInput());
			press("ArrowDown", filterInput());
			expect(selectedTitle()).toBe("Copy name (N)");

			press("ArrowUp", filterInput());
			expect(selectedTitle()).toBe("Open (O)");
			expect(filterInput().readOnly).toBe(true);
			press("ArrowUp", filterInput());
			expect(filterInput().readOnly).toBe(false);
			expect(visibleTitles()).toEqual(["Open", "Copy name", "Rename"]);
		});

		it("同じキーの項目を順に巡り、最後の次は最初へ戻って、実行はしない", () => {
			const menu = new PaletteMenu();
			menu.addItem((item) => item.setTitle("Copy path").setAccessKey("p").onClick(vi.fn()));
			menu.addItem((item) => item.setTitle("Rename").setAccessKey("r").onClick(vi.fn()));
			menu.addItem((item) => item.setTitle("Edit props").setAccessKey("p").onClick(vi.fn()));
			menu.showAtPosition({ x: 0, y: 0 });

			expect(selectedTitle()).toBeNull();
			press("p");
			expect(selectedTitle()).toBe("Copy path (P)");
			press("p");
			expect(selectedTitle()).toBe("Edit props (P)");
			press("p");
			expect(selectedTitle()).toBe("Copy path (P)");
			expect(document.querySelector(".menu")).not.toBeNull();
		});

		it("同じキーの項目が複数あるときは、押すたびに順番にカーソルが移り、Enter で実行する", () => {
			const menu = new PaletteMenu();
			const first = vi.fn();
			const second = vi.fn();
			menu.addItem((item) => item.setTitle("A").setAccessKey("p").onClick(first));
			menu.addItem((item) => item.setTitle("B").setAccessKey("p").onClick(second));
			menu.showAtPosition({ x: 0, y: 0 });

			press("p");
			press("p");
			press("Enter");
			expect(first).not.toHaveBeenCalled();
			expect(second).toHaveBeenCalledOnce();
		});

		it("入力欄のクリックでも入力モードへ戻る", () => {
			const { menu } = keyedMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown", filterInput());
			filterInput().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

			expect(filterInput().readOnly).toBe(false);
		});

		it("絞り込みの欄がない短いメニューは、開いた直後から選択モードでキー1打で実行する", () => {
			const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, 5);
			const open = vi.fn();
			menu.addItem((item) => item.setTitle("Open").setAccessKey("o").onClick(open));
			menu.showAtPosition({ x: 0, y: 0 });

			expect(visibleTitles()).toEqual(["Open (O)"]);
			press("o");
			expect(open).toHaveBeenCalledOnce();
		});
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

	it("IME が空白だけを入力欄に入れても、選択を保ったままスペースで切り替えられます", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });

		// IME が有効だと、1回目のスペースは全角スペースとして入力欄に入る。
		type("　");
		expect(filterInput().value).toBe("");
		expect(selectedTitle()).toBe("Open in terminal");
		expect(press(" ", filterInput()).defaultPrevented).toBe(true);
		expect(runs.open).toHaveBeenCalledOnce();
	});

	it("IME 中の keydown (key が Process) でも、code が Space ならスペースとして扱います", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });
		const event = new KeyboardEvent("keydown", {
			key: "Process",
			code: "Space",
			bubbles: true,
			cancelable: true,
		});
		filterInput().dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(runs.open).toHaveBeenCalledOnce();
	});

	it("空白だけの入力で絞り込みを解除します", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("rename");
		expect(visibleTitles()).toEqual(["Rename…"]);
		type(" ");

		expect(filterInput().value).toBe("");
		expect(visibleTitles()).toHaveLength(3);
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

describe("サブメニューの位置", () => {
	const size = { width: 150, height: 80 };
	const viewport = { width: 600, height: 600 };

	it("親メニューの右端に少し重ねて、持ち主の項目の高さに揃えて置く", () => {
		expect(placeSubmenu({ left: 100, right: 300 }, 200, size, viewport)).toEqual({
			left: 298,
			top: 200,
		});
	});

	it("右に収まらないときは親メニューの左へ反転して、左端に少し重ねる", () => {
		expect(placeSubmenu({ left: 300, right: 500 }, 200, size, viewport)).toEqual({
			left: 152,
			top: 200,
		});
	});

	it("下に収まらないときは、収まるまで上へずらす", () => {
		expect(placeSubmenu({ left: 100, right: 300 }, 580, size, viewport).top).toBe(520);
	});

	it("表示領域より大きくても、上端と左端を越えない", () => {
		expect(
			placeSubmenu(
				{ left: 0, right: 50 },
				10,
				{ width: 900, height: 900 },
				{ width: 100, height: 100 },
			),
		).toEqual({ left: 0, top: 0 });
	});
});

describe("パレットメニューのサブメニュー", () => {
	/** `accessKeys` なら、項目にアクセスキーを付ける。付けると、選択モードのタイトルに "(C)" のような表示が付く。 */
	function submenuSample(accessKeys = false) {
		const menu = new PaletteMenu();
		const runs = { open: vi.fn(), copy: vi.fn(), name: vi.fn(), path: vi.fn() };
		let submenu!: PaletteMenu;
		const keyed = (item: PaletteMenuItem, key: string) =>
			accessKeys ? item.setAccessKey(key) : item;
		menu.addItem((item) => keyed(item.setTitle("Open"), "o").onClick(runs.open));
		menu.addItem((item) => {
			keyed(item.setTitle("Copy"), "c").onClick(runs.copy);
			submenu = item.setSubmenu();
			submenu.addItem((child) => keyed(child.setTitle("Copy name"), "n").onClick(runs.name));
			submenu.addItem((child) => keyed(child.setTitle("Copy path"), "p").onClick(runs.path));
		});
		menu.addItem((item) => item.setTitle("Delete"));
		return { menu, runs, submenu };
	}

	function menuElements(): HTMLElement[] {
		return [...document.querySelectorAll<HTMLElement>(".menu")];
	}

	function titlesIn(menuEl: HTMLElement | undefined): string[] {
		return [...(menuEl?.querySelectorAll<HTMLElement>(".menu-item-title") ?? [])].map(
			(element) => element.textContent ?? "",
		);
	}

	function selectedTitles(): string[] {
		return [...document.querySelectorAll<HTMLElement>(".menu-item.selected")].map(
			(element) => titleOf(element) ?? "",
		);
	}

	function hover(title: string): void {
		itemNamed(title).dispatchEvent(new Event("pointerover", { bubbles: true }));
	}

	describe("開く・閉じる", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			// happy-dom の Window は、フェイクタイマーを差し替えた後のグローバルのタイマーを知らないので、渡し直す。
			Object.assign(window, {
				setTimeout: globalThis.setTimeout,
				clearTimeout: globalThis.clearTimeout,
			});
		});
		afterEach(() => vi.useRealTimers());

		it("サブメニューを持つ項目は右端に矢印を出し、開閉を支援技術に公開する", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });

			const copy = itemNamed("Copy");
			expect(copy.classList.contains("has-submenu")).toBe(true);
			expect(copy.lastElementChild?.classList.contains("mod-submenu")).toBe(true);
			expect(copy.getAttribute("aria-haspopup")).toBe("menu");
			expect(copy.getAttribute("aria-expanded")).toBe("false");
			expect(itemNamed("Open").classList.contains("has-submenu")).toBe(false);
		});

		it("クリックでサブメニューを開き、メニュー全体は閉じず、項目の onClick は呼ばない", () => {
			const { menu, runs } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });

			itemNamed("Copy").click();

			expect(menuElements()).toHaveLength(2);
			expect(titlesIn(menuElements()[1])).toEqual(["Copy name", "Copy path"]);
			expect(itemNamed("Copy").getAttribute("aria-expanded")).toBe("true");
			expect(runs.copy).not.toHaveBeenCalled();
		});

		it("サブメニューの項目を実行すると、メニュー全体を閉じて onHide を1回呼ぶ", () => {
			const { menu, runs } = submenuSample();
			const onHide = vi.fn();
			menu.onHide(onHide);
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();

			itemNamed("Copy path").click();

			expect(runs.path).toHaveBeenCalledOnce();
			expect(menuElements()).toHaveLength(0);
			expect(onHide).toHaveBeenCalledOnce();
		});

		it("開いたままにする項目をサブメニューで実行しても、メニューは開いたまま", () => {
			const menu = new PaletteMenu();
			const run = vi.fn();
			menu.addItem((item) =>
				item
					.setTitle("Group")
					.setSubmenu()
					.addItem((child) => child.setTitle("Toggle").setKeepOpen().onClick(run)),
			);
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Group").click();

			itemNamed("Toggle").click();

			expect(run).toHaveBeenCalledOnce();
			expect(menuElements()).toHaveLength(2);
		});

		it("ポインターが乗って待ち時間が過ぎると開き、別の項目に乗って待ち時間が過ぎると閉じる", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });

			hover("Copy");
			vi.advanceTimersByTime(249);
			expect(menuElements()).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(menuElements()).toHaveLength(2);

			hover("Delete");
			vi.advanceTimersByTime(249);
			expect(menuElements()).toHaveLength(2);
			vi.advanceTimersByTime(1);
			expect(menuElements()).toHaveLength(1);
			expect(itemNamed("Copy").getAttribute("aria-expanded")).toBe("false");
		});

		it("待ち時間のうちにポインターが別の項目へ移ったら、開かない", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });

			hover("Copy");
			vi.advanceTimersByTime(100);
			hover("Delete");
			vi.advanceTimersByTime(1000);

			expect(menuElements()).toHaveLength(1);
		});

		it("ポインターがサブメニューへ入ったら、閉じる予約を取り消して、持ち主の項目を選んだままにする", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			hover("Copy");
			vi.advanceTimersByTime(250);
			hover("Delete");

			hover("Copy name");
			vi.advanceTimersByTime(1000);

			expect(menuElements()).toHaveLength(2);
			expect(selectedTitles()).toEqual(["Copy", "Copy name"]);
		});

		it("無効な項目と、空のサブメニューは開かない", () => {
			const menu = new PaletteMenu();
			menu.addItem((item) => {
				item.setTitle("Off")
					.setDisabled(true)
					.setSubmenu()
					.addItem((child) => child.setTitle("In"));
			});
			menu.addItem((item) => item.setTitle("Empty").setSubmenu());
			menu.showAtPosition({ x: 0, y: 0 });

			itemNamed("Off").click();
			itemNamed("Empty").click();

			expect(menuElements()).toHaveLength(1);
		});

		it("サブメニュー自身の hide() は、そのサブメニューだけを閉じる", () => {
			const { menu, submenu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();

			submenu.hide();

			expect(menuElements()).toHaveLength(1);
		});

		it("外側の押下で全体を閉じ、サブメニューの中の押下では閉じない", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();

			itemNamed("Copy name").dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, button: 0 }),
			);
			expect(menuElements()).toHaveLength(2);

			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
			expect(menuElements()).toHaveLength(0);
		});

		it("開き直したときは、閉じる前に開いていたサブメニューを引きずらない", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();

			menu.showAtPosition({ x: 5, y: 5 });

			expect(menuElements()).toHaveLength(1);
			expect(itemNamed("Copy").getAttribute("aria-expanded")).toBe("false");
		});
	});

	describe("キーボード", () => {
		it("→ で開いて最初の項目を選び、↓ で進み、← で閉じて持ち主の項目へ戻る", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");
			press("ArrowDown");
			expect(selectedTitles()).toEqual(["Copy"]);

			press("ArrowRight");
			expect(menuElements()).toHaveLength(2);
			expect(selectedTitles()).toEqual(["Copy", "Copy name"]);

			press("ArrowDown");
			expect(selectedTitles()).toEqual(["Copy", "Copy path"]);
			press("ArrowDown");
			expect(selectedTitles()).toEqual(["Copy", "Copy name"]);

			press("ArrowLeft");
			expect(menuElements()).toHaveLength(1);
			expect(selectedTitles()).toEqual(["Copy"]);
		});

		it("アクセスキーで開いたときも、開いた項目を選び、← で閉じるとその項目へ戻る", () => {
			const { menu } = submenuSample(true);
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");
			expect(selectedTitles()).toEqual(["Open (O)"]);

			press("c");
			expect(selectedTitles()).toEqual(["Copy (C)", "Copy name (N)"]);

			press("ArrowLeft");
			expect(selectedTitles()).toEqual(["Copy (C)"]);
		});

		it("サブメニューを持たない項目では、→ は何もしない", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");

			const event = press("ArrowRight");

			expect(menuElements()).toHaveLength(1);
			expect(event.defaultPrevented).toBe(false);
		});

		it("Enter で開いて最初の項目を選び、もう一度 Enter でその項目を実行する", () => {
			const { menu, runs } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");
			press("ArrowDown");

			press("Enter");
			expect(selectedTitles()).toEqual(["Copy", "Copy name"]);
			press("Enter");

			expect(runs.name).toHaveBeenCalledOnce();
			expect(runs.copy).not.toHaveBeenCalled();
			expect(menuElements()).toHaveLength(0);
		});

		it("Escape はサブメニューだけを閉じ、もう一度でメニュー全体を閉じる", () => {
			const { menu } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();

			press("Escape");
			expect(menuElements()).toHaveLength(1);
			press("Escape");
			expect(menuElements()).toHaveLength(0);
		});

		it("アクセスキーでサブメニューを開き、その中のアクセスキーで実行する", () => {
			const { menu, runs } = submenuSample(true);
			menu.showAtPosition({ x: 0, y: 0 });

			press("c");
			expect(menuElements()).toHaveLength(2);
			expect(titlesIn(menuElements()[1])).toEqual(["Copy name (N)", "Copy path (P)"]);
			press("n");

			expect(runs.name).toHaveBeenCalledOnce();
			expect(menuElements()).toHaveLength(0);
		});

		it("サブメニューが開いている間は、親のメニューのアクセスキーを使わない", () => {
			const { menu, runs } = submenuSample(true);
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy (C)").click();

			press("o");

			expect(runs.open).not.toHaveBeenCalled();
			expect(menuElements()).toHaveLength(2);
		});

		it("サブメニューが開いている間は、スペースもサブメニューの項目に働く", () => {
			const { menu, runs } = submenuSample();
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");
			press("ArrowDown");
			press("ArrowRight");

			const event = press(" ");

			expect(runs.name).toHaveBeenCalledOnce();
			expect(event.defaultPrevented).toBe(true);
		});

		it("入れ子のサブメニューは、一番奥から1段ずつ閉じ、奥の項目を実行すると全体を閉じる", () => {
			const menu = new PaletteMenu();
			const run = vi.fn();
			menu.addItem((item) => {
				const outer = item.setTitle("Outer").setSubmenu();
				outer.addItem((inner) => {
					inner
						.setTitle("Inner")
						.setSubmenu()
						.addItem((leaf) => leaf.setTitle("Leaf").onClick(run));
				});
			});
			menu.showAtPosition({ x: 0, y: 0 });
			press("ArrowDown");
			press("ArrowRight");
			press("ArrowRight");
			expect(menuElements()).toHaveLength(3);
			expect(selectedTitles()).toEqual(["Outer", "Inner", "Leaf"]);

			press("ArrowLeft");
			expect(menuElements()).toHaveLength(2);
			press("ArrowRight");
			press("Enter");

			expect(run).toHaveBeenCalledOnce();
			expect(menuElements()).toHaveLength(0);
		});
	});

	describe("絞り込み", () => {
		function filterSubmenuMenu(minItems = 3) {
			const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, minItems);
			const runs = { open: vi.fn(), name: vi.fn(), path: vi.fn() };
			menu.addItem((item) => item.setTitle("Open").onClick(runs.open));
			menu.addSeparator();
			menu.addItem((item) => {
				const submenu = item.setTitle("Copy").setSubmenu();
				submenu.addItem((child) =>
					child
						.setTitle("Copy file name")
						.setSearchTerms("copy-file-name")
						.onClick(runs.name),
				);
				submenu.addSeparator();
				submenu.addItem((child) => child.setTitle("Copy path").onClick(runs.path));
			});
			return { menu, runs };
		}

		it("絞り込みの欄を出すかどうかは、サブメニューの中の操作も数える", () => {
			const { menu } = filterSubmenuMenu(3);
			menu.showAtPosition({ x: 0, y: 0 });

			expect(filterInput().closest(".my-palette-menu-filter")?.hasAttribute("hidden")).toBe(
				false,
			);
			expect(visibleTitles()).toEqual(["Open", "Copy"]);
		});

		it("絞り込み中は、サブメニューの項目を親の一覧に並べ、それを開く項目は隠す", () => {
			const { menu } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });

			type("copy");

			expect(visibleTitles()).toEqual(["Copy file name", "Copy path"]);
			expect(menuElements()).toHaveLength(1);
			expect(menuElements()[0].contains(itemNamed("Copy path"))).toBe(true);
		});

		it("英語の操作 ID でも、サブメニューの中の項目へ届き、Enter で実行できる", () => {
			const { menu, runs } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });

			type("COPY-FILE");
			expect(visibleTitles()).toEqual(["Copy file name"]);
			press("Enter", filterInput());

			expect(runs.name).toHaveBeenCalledOnce();
			expect(menuElements()).toHaveLength(0);
		});

		it("↓ で選択モードに入って、並べた項目を矢印で選べる", () => {
			const { menu, runs } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			type("copy");
			expect(selectedTitle()).toBe("Copy file name");

			press("ArrowDown", filterInput());
			expect(selectedTitle()).toBe("Copy path");
			press("Enter", filterInput());

			expect(runs.path).toHaveBeenCalledOnce();
		});

		it("開いていたサブメニューは、絞り込みを始めると閉じる", () => {
			const { menu } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			itemNamed("Copy").click();
			expect(menuElements()).toHaveLength(2);

			type("o");

			expect(menuElements()).toHaveLength(1);
		});

		it("絞り込みを消すと、項目を元のサブメニューへ戻し、隠す印も外す", () => {
			const { menu } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			type("path");
			expect(visibleTitles()).toEqual(["Copy path"]);

			type("");
			expect(visibleTitles()).toEqual(["Open", "Copy"]);
			itemNamed("Copy").click();

			const submenuEl = menuElements()[1];
			expect(titlesIn(submenuEl)).toEqual(["Copy file name", "Copy path"]);
			expect(submenuEl.querySelectorAll(".is-filtered")).toHaveLength(0);
			expect(submenuEl.querySelectorAll(".menu-group, .menu-separator")).toHaveLength(3);
		});

		it("絞り込んだまま閉じて開き直しても、サブメニューは元の姿で開く", () => {
			const { menu } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });
			type("path");
			menu.close();

			menu.showAtPosition({ x: 0, y: 0 });
			expect(visibleTitles()).toEqual(["Open", "Copy"]);
			itemNamed("Copy").click();

			expect(titlesIn(menuElements()[1])).toEqual(["Copy file name", "Copy path"]);
			expect(menuElements()[1].querySelectorAll(".is-filtered")).toHaveLength(0);
		});

		it("何にも一致しなければ、空のメッセージを出す", () => {
			const { menu } = filterSubmenuMenu();
			menu.showAtPosition({ x: 0, y: 0 });

			type("zzz");

			expect(visibleTitles()).toEqual([]);
			expect(document.querySelector(".my-palette-menu-empty.is-visible")).not.toBeNull();
		});
	});
});
