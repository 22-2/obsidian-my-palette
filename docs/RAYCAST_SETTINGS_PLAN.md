# Raycast方式の設定画面と状態復元の計画

Raycastの設定画面のように、設定を「全体の動作」「ショートカット一覧」「モードごとのページ」に整理し直す。あわせて、すべてのエイリアスと、パレット・選択画面の中で使うホットキー(フッターのスイッチを含む)を設定できるようにし、`Open palette` を毎回ルートから開くのではなく、前回の状態を復元する方式に変える。

参考: [Settings | Raycast Manual](https://manual.raycast.com/settings)

## Raycastの設定の考え方

- 左のサイドバーに、全体設定のタブ(General、Launcher、Shortcuts、Keyboard、Advancedなど)と、拡張機能ごとの項目が並ぶ。
- 拡張機能のページには、その拡張機能の設定と、配下のコマンドの一覧(エイリアス、ホットキー、有効/無効)がある。無効にしたコマンドはRoot Searchに出ない。
- Shortcutsタブで、割り当て済みのホットキーとエイリアスを一か所でまとめて見られる。
- Launcherタブの「Pop to Root Search」で、ウィンドウを閉じてから何秒後にRoot Searchへ戻すかを選ぶ。「Immediately」か、最大180秒の待ち時間を指定する。

## 現状の問題

### 設定が分散している

| 設定                                                                  | 今ある場所                           |
| --------------------------------------------------------------------- | ------------------------------------ |
| 前回入力の記憶、検索履歴の消去、デバッグ表示、`>` と `e` のエイリアス | 設定 → Palette                       |
| パレット・選択画面のホットキー(6件)                                   | 設定 → Hotkeys                       |
| 除外フォルダー、優先度を下げるフォルダー、無視ノートの索引、並び順    | 設定 → Vault file search             |
| Everythingの接続、検索対象の拡張子                                    | 設定 → Everything                    |
| 検索語の強調表示(モーダル・サイドバー・テーブル別)                    | パレットの `…` メニューだけ          |
| 検索履歴の有効化・追加までの待ち時間・保持日数                        | `data.json` にはあるが設定画面にない |
| Everythingの最大件数・入力待ち時間・タイムアウト                      | `data.json` にはあるが設定画面にない |
| 外部Markdownをどこで開くか(`openExternalMarkdownInObsidian`)          | `data.json` にはあるが設定画面にない |

`settingTab.ts` の `getControlValue` / `setControlValue` には保存処理があるのに、`settingPages.ts` に項目の定義がないため画面から変えられない設定が残っている。

### 設定できるものとできないものが混在している

| 種類                           | 設定できる                                                                         | 設定できない(コードに直書き)                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| エイリアス                     | `>`、`e`                                                                           | `esdir`、`o`、`b`、`bk`、`sc`、`t`、隠しエイリアス `es`                                        |
| パレット・選択画面のホットキー | 一時的に隠す、プレビュー、検索履歴、操作メニュー、入力モードへ戻る、選択の切り替え | フッターのスイッチ(Ignored の `Ctrl+I`、MOC選択画面の Mutual の `Ctrl+M`)、モードに入る(`Tab`) |

フッターのスイッチは `StatusToggle` が「`Ctrl` + 英字1文字」だけを受け付ける作りで、キーが各呼び出し元(`ignoredToggle.ts`、`mocRelateds.ts`)に直書きされている。表示するヒント(`Ctrl+I` など)もそこから組み立てている。

パレットを開くコマンドのホットキーは、Obsidianの 設定 → ホットキー で設定できるので、この計画の対象外とする。

### ホットキー画面が場所を取る

1件ごとに名前・説明・入力欄・`Change`・`Reset` のボタンが縦に並ぶため、6件でも画面の大半を使う。Obsidianの「ホットキー」やVS Codeの「Keyboard Shortcuts」のように、1件1行の表にしたい。

## 目標

### 設定画面の構成

Obsidianの宣言的設定API(`getSettingDefinitions()`、`minAppVersion` は1.13.0)の `page` で、次のページを並べる。

```text
My Palette
├── General            全体の動作(ルートへ戻るまでの時間、検索履歴、表示、診断)
├── Shortcuts          パレット・選択画面のホットキーとエイリアスを1つの表で
├── Files              ファイル検索(除外フォルダー、並び順、無視ノートの索引)
├── Everything         接続 + 「Search Vault Notes」「Search All Files in Vault」の2モード
├── Links              「Search Outgoing Links」「Search Backlinks」の2モード
├── Obsidian           「Run Command」「Search Bookmarks」「Switch Tab」の3モード
└── Smart Connections  「Search Related Notes」
```

- RaycastのExtensionsにあたるのが `Files` 以下の各ページで、ページの中に「設定」と「モードの表」を置く。
- 共通の設定(Everythingの接続など)は、Raycastの拡張機能の設定と同じく、そのページの上部に置く。
- モードの表は1行1モードで、列は `Mode`、`Alias`、`Enabled`。
- 無効にしたモードはRoot Searchの行に出さず、エイリアス+Spaceでも入れない。`Files`(ルートそのもの)は無効にできない。

### General(Raycastの General + Launcher)

| 項目                               | 内容                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pop to Root Search                 | `Immediately` / `After 30 seconds` / `After 60 seconds` / `After 90 seconds`。既定は `After 90 seconds` |
| Search history                     | 有効化、追加までの待ち時間、保持日数、すべて消去                                                        |
| Highlight search matches           | モーダル・サイドバー・テーブル別。`…` メニューの切り替えと同じ値                                        |
| Open external Markdown in Obsidian | 既存の `openExternalMarkdownInObsidian`                                                                 |
| Show debug messages                | 既存                                                                                                    |

`Remember last input`(モードごとの前回入力をメモリーに記憶)は、下の「状態の復元」に役割を引き継いで廃止する(「決めたいこと」参照)。

### Shortcuts(Raycast の Shortcuts、VS Code の Keyboard Shortcuts)

1つの表で、パレット・選択画面のホットキーとモードのエイリアスを見て編集する。

| 列         | 内容                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Command    | 操作名(エイリアスの行はモード名)                                                                                |
| Keybinding | 割り当て。クリックで記録を開始し、`Esc` で取り消し、`Backspace` / `Delete` で解除。エイリアスの行は文字の入力欄 |
| When       | 使える場所(`All pickers` / `Palette` / `File search` / `MOC selector` / `Tag and MOC selectors`)                |
| (操作)     | 既定値と違う行だけ、戻すボタンを出す                                                                            |

- 上部に絞り込み欄を置き、操作名・キー・使える場所で絞り込む。
- 重複はその行の下に1行で表示する(例: `Already assigned to Search history`)。同時に使われない場所どうし(例: Mutual とパレットのプレビュー)は重複として扱わない。
- 1行の高さは28〜32px程度に抑え、説明文は行に出さずツールチップ(`title`)にする。
- 表の本体は `render` コールバックで描く(宣言的APIに表の部品はないため)。設定画面は別ウィンドウで開くので、イベントとフォーカスは要素の `ownerDocument` を基準に扱う。

対象にするホットキー:

| 操作                                 | 既定     | 使える場所                |
| ------------------------------------ | -------- | ------------------------- |
| Temporarily hide palette             | `Alt+H`  | All pickers               |
| Preview selected result              | `→`      | Palette                   |
| Search history                       | `Ctrl+R` | All pickers               |
| Show result actions                  | `Ctrl+K` | Palette                   |
| Return to input mode                 | `F`      | Tag and MOC selectors     |
| Toggle selection                     | `Space`  | Tag and MOC selectors     |
| Toggle Obsidian-excluded files(新規) | `Ctrl+I` | File search、MOC selector |
| Toggle Mutual(新規)                  | `Ctrl+M` | MOC selector              |
| Enter mode(新規)                     | `Tab`    | Palette(ルート)           |

`Enter`、`Esc`、矢印キー、`Home` / `End`、`Backspace`(空入力でルートへ戻る)は、Obsidianと同じく標準の動作として固定する。

### エイリアスをすべて設定可能にする

- `modes.<id>.alias` として全モードのエイリアスを保存する。既存の `prefixes.command` / `prefixes.everything` は移行して消す。
- 入力チェックは今の `validateModeAlias` を全モードに広げる(空・空白入り・ほかのモードと同じ値を拒否)。
- 隠しエイリアス `es` は廃止する(「決めたいこと」参照)。

### 状態の復元(Pop to Root Search)

`Open palette` は、閉じたときの状態を覚えておき、次に開いたときに復元する。

- 覚えるもの: 画面(ルートかどのモードか)、検索語、Ignoredスイッチ、アクティブな行、スクロール位置。
- 閉じてから設定の秒数が過ぎていたら、ルートの空の状態で開く。`Immediately` なら常にルートの空の状態で開く。
- 覚えるのはメモリーだけで、`data.json` には書かない(Obsidianを再起動するとルートから始まる)。今の `Remember last input` と同じ方針。
- 結果を開いてパレットを閉じた場合も覚える(Raycastと同じ)。復元したときに検索語は全選択しておき、すぐ打ち直せるようにする。
- `Open command list` など、モードを直接開くコマンドは復元せず、そのモードの空の状態から始める。
- サイドバーとテーブルは今どおりペインごとに状態を保存するので、この設定の対象外。

## 内部設計

### 設定データ

```ts
interface ModeSettings {
	alias: string;
	enabled: boolean;
}

interface MyPaletteSettings {
	// 追加
	launcher: { popToRootAfterSeconds: 0 | 30 | 60 | 90 }; // 0 = Immediately
	modes: Record<PaletteModeId, ModeSettings>;
	hotkeys: PaletteHotkeys; // toggleIgnored、toggleMutual、enterMode を追加
	// 削除(移行)
	// prefixes: { command; everything }
	// rememberLastInput
}
```

- `SETTINGS_SCHEMA_VERSION` を19に上げ、`mergeSettings` で移行する。
    - `prefixes.command` / `prefixes.everything` → `modes.commands.alias` / `modes.everything.alias`(前後の空白を除く)。
    - `rememberLastInput: false` → `popToRootAfterSeconds: 0`、`true` → 既定の90秒。
    - 新しいホットキー(`toggleIgnored`、`toggleMutual`、`enterMode`)は既定値で補う。
- 移行後は `prefixes` と `rememberLastInput` を保存データから消す。

### モード定義

- `paletteModeAlias(id, prefixes)` を `paletteModeAlias(id, settings.modes)` に変え、直書きのエイリアスは既定値(`DEFAULT_SETTINGS.modes`)へ移す。
- `matchPaletteModes` と `parseDirectModeEntry` は、無効なモードを除いて照合する。
- `validateModeAlias` は全モードを対象にする。

### フッターのスイッチ

- `StatusToggleOptions.ctrlKey`(英字1文字)を、`hotkey: () => PaletteHotkey | null` に置き換える。判定は既存の `matchesHotkey` を使い、ヒント表示は `formatHotkey` で作る。設定を変えたら、開いているパレットにもすぐ反映する(今のホットキーと同じく関数で読む)。
- 割り当てを解除した(`null`)スイッチは、クリックでだけ切り替わり、ヒントを出さない。
- `IGNORED_SHORTCUT`(ヘルプ用の直書き)を消し、ヘルプも設定値から表示する。

### ホットキーの重複検査

- 各操作に「使える場所」を持たせ、場所が重なる操作どうしだけを重複として検査する。今の `hotkeyError` は全操作を総当たりで比べているため、場所を足さないと `Ctrl+M`(MOC選択画面だけ)と別の画面の操作まで衝突扱いになる。

### 状態の復元

- `PaletteOpener` に、閉じた時刻と `PaletteRestoreState`(route、query、ignored、activeIndex、scrollTop)を持たせる。
- `PaletteModal` は閉じるときに状態を渡し、開くときに `PaletteOpener` から受け取って適用する。
- 時間の判定は純粋関数(`shouldRestore(closedAt, now, seconds)`)にして単体テストする。

## 実装手順(コミット単位)

各コミットの前に `pnpm format:check`、`pnpm lint`、`pnpm test` を通す。

1. `refactor`: エイリアスの保存先を `modes.<id>` に移し、スキーマを19に上げて移行する。画面は変えない。
2. `feat`: 全モードのエイリアスと有効/無効を設定できるようにし、無効なモードをRoot Searchとエイリアス入力から外す。
3. `refactor`: フッターのスイッチが任意のホットキーを受け付けるようにし、重複検査に「使える場所」を入れる(既定値は今と同じ)。
4. `feat`: `Toggle Obsidian-excluded files`、`Toggle Mutual`、`Enter mode` のホットキーを設定できるようにする。
5. `feat`: Shortcutsページの表(ホットキーとエイリアス)。旧Hotkeysページを置き換える。
6. `feat!`: 設定画面をGeneral / Shortcuts / モードごとのページに組み直す。画面に無かった設定(検索履歴の詳細、Everythingの詳細、強調表示、外部Markdown)も出す。
7. `feat!`: `Open palette` の状態復元と `Pop to Root Search`。`Remember last input` を廃止して移行する。
8. `docs`: README / README.ja / 詳細仕様を更新する。

## テスト

### 単体テスト

- 設定の移行(`prefixes` と `rememberLastInput` から新しい形へ、既定値の補完)。
- 全モードのエイリアス検査、無効なモードの除外(行の照合とエイリアス+Space)。
- ホットキーの重複検査に `toggleIgnored` / `toggleMutual` / `enterMode` を含め、同時に使われない場所どうしは重複にしない。
- フッターのスイッチが設定したホットキーで切り替わり、解除するとヒントが消えること。
- `shouldRestore` の境界(ちょうど30秒、`Immediately`)。
- 設定ページの構成(ページ名、各ページのグループ、モードの表の行)。

### E2E

- Shortcutsの表: 記録、重複の表示、解除、既定値に戻す、絞り込み。別ウィンドウの設定画面で動くこと。
- Ignored と Mutual のキーを変えると、フッターのヒントと切り替えのキーが変わること(パレット、サイドバー、MOC選択画面)。
- モードを無効にするとRoot Searchの行とエイリアス入力から消えること。
- エイリアスを変えると、ルートの行のバッジと直接移動が変わること。
- 状態の復元: 閉じて開くとモードと検索語が戻る。時間を進めるとルートに戻る(時刻は差し替え可能にする)。`Immediately` では常にルート。

## 決めたいこと

計画は「推奨」列の案で進める前提にしている。

| 項目                            | 推奨                                                  | 代案                                            |
| ------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Pop to Root Searchの選択肢      | `Immediately` / 30 / 60 / 90秒、既定90秒              | 秒数を自由入力(30〜90)                          |
| 復元する範囲                    | 画面、検索語、Ignored、アクティブな行、スクロール位置 | 画面と検索語だけ                                |
| `Remember last input`           | 廃止して `Pop to Root Search` に統合                  | 残して、`Open palette` 以外のコマンドに使う     |
| 隠しエイリアス `es`             | 廃止                                                  | 1モードに複数のエイリアスを持てるようにして残す |
| モードの無効化                  | 入れる                                                | 入れない(エイリアスだけ)                        |
| `Enter mode`(`Tab`)のホットキー | 設定可能にする                                        | `Enter` と同じく標準の動作として固定する        |
