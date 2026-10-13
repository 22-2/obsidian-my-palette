# 設定画面の再構成 計画v2

`RAYCAST_SETTINGS_PLAN.md`(v1)の目標はそのままに、設定画面の分け方を見直した版。v1の「決めたいこと」1〜6は、すべて推奨案で決定済み(2026-10-12)。

- Pop to Root Search: `Immediately` / 30 / 60 / 90秒、既定90秒
- 復元する範囲: 画面、検索語、Ignored、アクティブな行、スクロール位置
- `Remember last input` は廃止して Pop to Root Search に統合
- 隠しエイリアス `es` は廃止
- モードの有効/無効を入れる
- `Enter mode`(`Tab`)は設定可能にする

状態の復元、全エイリアスとフッターのスイッチ(Ignored / Mutual)のホットキー化、設定データの移行は、v1の「内部設計」をそのまま使う。v2で変えるのは画面の構成だけ。

## 分け方の検討

### Raycast方式(コマンドグループごとのページ)は合うか

Raycastの設定は、本体の設定タブ(General、Launcher、Shortcuts…)の下に、拡張機能(コマンドグループ)ごとのページが並ぶ。拡張機能が数十あり、それぞれに独自の設定があるから、この分け方が効く。

このプラグインに当てはめると、グループごとの独自設定は偏っている。

| グループ          | モード                                        | エイリアスと有効/無効以外の設定                                                      |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Files             | (ルート)                                      | 多い(対象拡張子、除外フォルダー、優先度を下げるフォルダー、無視ノートの索引、並び順) |
| Everything        | Search Vault Notes、Search All Files in Vault | 多い(接続、認証、件数、待ち時間、タイムアウト)                                       |
| Links             | Search Outgoing Links、Search Backlinks       | なし                                                                                 |
| Obsidian          | Run Command、Search Bookmarks、Switch Tab     | なし                                                                                 |
| Smart Connections | Search Related Notes                          | なし                                                                                 |

グループごとにページを作ると、7ページのうち3ページは「エイリアスと有効/無効だけ」のほぼ空のページになる。どのモードのエイリアスを変えるにも、まずどのグループに属するかを知っている必要があり、探す手間が増える。**このプラグインでは、Raycast方式に分けてもわかりやすくならない**と判断した。

代わりに、「何をしたいか」でページを分ける。

| ページ       | 役割                                    | Raycastで近いもの                           |
| ------------ | --------------------------------------- | ------------------------------------------- |
| General      | パレット全体の動作                      | General + Launcher                          |
| Modes        | 全モードのエイリアスと有効/無効を一覧で | 各拡張機能のコマンド一覧を1か所に集めたもの |
| File search  | ルートのファイル検索                    | File Search拡張機能                         |
| Shortcuts    | パレット・選択画面のホットキー          | Shortcuts / Keyboard                        |
| Integrations | 外部ツールとの連携                      | (なし。minimalshotの外部ツール画面)         |

エイリアスは「Modes」だけで編集する。v1ではShortcutsの表にも出していたが、同じ値を2か所で編集できると、どちらで変えたかがわかりにくくなるため外した。

### Integrations にまとめるのは有用か

外部連携は Everything、Smart Connections、VS Code の3つで、どれも機能は多くない。

| 連携              | 有効/無効で変わること                                                                                         | 詳しい設定                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Everything        | 「Search Vault Notes」「Search All Files in Vault」の2モードを出すかどうか                                    | 接続先URL、ユーザー名、パスワード、接続テスト、最大件数、入力待ち時間、タイムアウト |
| Smart Connections | 「Search Related Notes」を出すかどうか                                                                        | なし                                                                                |
| VS Code           | Vault外・無視対象のMarkdownをVS Codeで開くか(無効ならObsidianで開く。`openExternalMarkdownInObsidian` の反対) | なし                                                                                |

1つのページに並べる形は有用だと考える。

- いちばんよく触る「使う/使わない」が一覧の行だけで済み、ふだん触らない接続設定は奥に入る。
- 連携が増えても、一覧に1行足すだけで済む。
- Smart Connections も「使う/使わない」という設定を持つので、一覧に出す意味がある(v2の初版では設定が無いので外していた)。

### minimalshot の外部ツール画面に合わせる

minimalshot の外部ツール画面は、次の形に変わった(`6a7c10a`)。

- 1ツール1行で、行には名前と、右端の有効/無効のスイッチだけを置く(歯車と要約のチップはやめた)。
- 名前を押すと、編集用のモーダルが開く。
- 無効にしたツールは設定を残したまま、ビューアのメニューから消える。

キャプチャモードの設定は、行を押すとその場で開閉するアコーディオンにした(`7d3b9b3`)。こちらは「使う/使わない」を持たない、詳しい設定だけのまとまりに使っている。

Integrations は「使う/使わない」が主で、詳しい設定は時々しか触らないので、外部ツール画面と同じ形にする。

```text
Integrations
┌──────────────────────────────────────────────┐
│ Everything                              [ON] │  名前を押すと編集モーダル
│ Smart Connections   Not installed       [OFF]│  名前は押せない(詳しい設定なし)
│ VS Code                                 [ON] │  名前は押せない(詳しい設定なし)
└──────────────────────────────────────────────┘
```

Obsidianでの作り:

- 各行は宣言的APIの `render` で、標準の `Setting` に名前とスイッチ(`addToggle`)を置く。詳しい設定がある連携だけ、名前を押せるボタンにしてモーダルを開く。
- モーダルの中身は標準の `Setting` で組み、変更したらその場で保存する(minimalshot と同じく「自動で保存」)。
- 設定の検索: モーダルの中身は検索に出ないため、行の `aliases`(検索用の別名)にモーダル内の項目名(`HTTP server URL`、`Request timeout` など)を入れ、検索するとその行が見つかるようにする。
- 別ウィンドウの設定画面: モーダルは設定ウィンドウの側に出す必要がある。Obsidianの `Modal` がどのウィンドウに開くかを、実装の最初に試して確かめる(実装手順11の最初)。設定ウィンドウに出せない場合は、宣言的APIのサブページに切り替える。
- Smart Connections が入っていないときは、行の説明に `Not installed` を出し、スイッチは押せるままにする(入れたらすぐ使えるように)。

サブページ(宣言的APIの `page`)との比較:

|                        | minimalshot 方式(名前でモーダル + スイッチ)                 | サブページ                                         |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 一覧の行               | 名前、右端に有効/無効                                       | 名前、説明、今の値、右端の矢印(スイッチは置けない) |
| 有効/無効の切り替え    | 一覧の行で済む                                              | 1つ奥のページを開く                                |
| 設定の検索             | 行は見つかる(`aliases`)、モーダルの中の項目そのものは出ない | 項目が出る                                         |
| 別ウィンドウの設定画面 | モーダルの出る場所を確かめる必要がある                      | Obsidianが扱う                                     |
| Obsidianの版           | 1.13.0のままでよい                                          | 一覧に今の値を出すなら1.13.1が必要                 |

有効/無効を一覧で切り替えられること、minimalshot と操作をそろえられること、`minAppVersion` を上げずに済むことから、**minimalshot 方式を推奨する**。

### Modes との関係

- Integrations で無効にした連携のモードは、Modes ページでも行を薄くして、スイッチを押せなくする(説明に `Turned off in Integrations`)。
- 連携を有効にしたあとの各モードの有効/無効は、Modes ページで個別に変えられる(例: Everything は使うが「Search All Files in Vault」だけ消す)。
- 連携が無効なモードは、Root Searchの行にもエイリアス入力にも出さない。

## v2の画面構成

```text
My Palette
├── General
│   ├── Launcher         Pop to Root Search
│   ├── Search history   有効化、追加までの待ち時間、保持日数(消去はパレットのメニューへ)
│   ├── Display          検索語の強調表示(モーダル、サイドバー、テーブル)
│   └── Diagnostics      デバッグ表示
├── Modes                全8モード: エイリアス、有効/無効
├── File search
│   ├── File types       対象拡張子(今は Everything ページにある)
│   ├── Excluded folders / Lower prior folders
│   ├── Obsidian-excluded file index
│   └── Result sorting
├── Shortcuts            ホットキーの表(9件)
└── Integrations         1連携1行。右端に有効/無効、名前でモーダル
    ├── Everything         モーダル: 接続、認証、接続テスト、件数、待ち時間、タイムアウト
    ├── Smart Connections  (詳しい設定なし)
    └── VS Code            (詳しい設定なし)
```

### Modes

- 1モード1行。名前はモードのタイトル(`Search Backlinks` など)、説明はサブタイトル。
- 右側に、エイリアスの入力欄(幅は狭め)と有効/無効のスイッチを横に並べる。
- 入力チェックは `validateModeAlias` を全モードに広げたもの。エラーはその行の下に出す。
- 行の構造は標準の `Setting` のままにして、名前で設定検索に出るようにする(独自の表にはしない)。

### Shortcuts

v1の「Shortcuts」から、エイリアスの行を除いたもの。1件1行の表で、`Command`、`Keybinding`、`When`、(既定に戻す)の列を持ち、上部に絞り込み欄を置く。表は独自に描く(`render`)ので、イベントとフォーカスは要素の `ownerDocument` を基準に扱う。

### Integrations

上の「minimalshot の外部ツール画面に合わせる」のとおり。

### 設定データの扱い

画面の場所が変わるだけの項目は、保存データのキーを変えない。

- 対象拡張子は `everything.vaultExtensions` のまま、File searchページに移す(ファイル一覧とEverythingの両方が使っている)。
- 外部Markdownの設定は `openExternalMarkdownInObsidian` のまま、Integrations の VS Code の行のスイッチにする(スイッチがオン = `false`)。
- 連携の有効/無効を新しく `integrations.everything.enabled` / `integrations.smartConnections.enabled` として保存する。既定はどちらもオン(今の動作と同じ)。

## パレットの `…` メニュー

検索履歴の消去を設定画面から外し、入力欄の右にある `…` のメニューに移す。消したい履歴は、そのパレットで履歴を見ているときに思いつくものなので、設定画面より近い場所に置く方がよい。

### 並び

今:

```text
Actions(見出し)
  (選択画面ごとの操作: 例 Insert selected)
  Move to right sidebar      ※モーダルだけ
  Help
───
Options(見出し)
  Highlight search matches
```

変更後:

```text
  Help
  Move to right sidebar      ※モーダルだけ
  (選択画面ごとの操作)
  Clear search history       ※赤字。2回押して消す
───
Options(見出し)
  Highlight search matches
```

- `Actions` の見出しは、項目が少なくなるので外す。
- 選択画面ごとの操作(タグ挿入の `Insert selected` など)は、消去の前に置く。消去を最後にして、うっかり押しにくくする。
- `Highlight search matches` は、すぐ切り替えたい表示の設定なので、メニューに残す(General の Display にも同じ値を出す)。

### 2回押して消す

下の「自前のメニュー」の上で作る。

1. 1回目: `Clear search history`(アイコン `trash`、赤字)を押すと、メニューは開いたまま、その項目が「確認待ち」に変わる。
    - 文言: `Click again to clear`、アイコン: `trash-2`
    - 見た目: 赤い背景に白い文字(ボタンの `setDestructive().setCta()` と同じ色の変数を使う)。
    - キーボードで押した場合も、選択はその項目に残る。
2. 2回目: 消去を実行し、メニューを閉じて通知する。
3. 確認待ちのままほかの項目へ移る・メニューを閉じると、確認待ちは取り消される。

## 自前のメニュー

`BaseSuggestModal` をObsidianの `SuggestModal` から抜き出して作ったのと同じく、メニューもObsidianの `Menu` から抜き出した `src/ui/paletteMenu.ts`(`PaletteMenu` / `PaletteMenuItem`)を使う。

### 理由

- 今の `src/ui/menus.ts` は、Escがパレットまで届く問題と、キーボードで開いたときに先頭を選ぶために、`Menu` の非公開の中身(`scope.keys`、`onArrowDown`)を書き換えている。Obsidianの更新で壊れうる。
- Obsidianには、メニューをOSのネイティブメニューで出す設定(外観 → ネイティブメニュー)がある。ネイティブメニューでは、上の書き換えも、色付けや開いたままの確認待ちも効かない。
- 結果の行を押してもメニューが閉じなかった不具合(`05b9565`)は、Obsidianのメニューが行の `mousedown` を受け取れないことが原因だった。`PaletteMenu` は外側の押下を捕捉段階(capture)で受けるので、行の側で閉じる処理が要らない。
- 開いたまま見た目を変える項目(`setKeepOpen`)を素直に書ける。

### `paletteMenu.ts` がすでに持っているもの

- Obsidianのメニューと同じDOMとクラス(`menu`、`menu-scroll`、`menu-group`、`menu-item`、`menu-item-icon`、`menu-item-title`、`menu-separator`、`selected`、`is-disabled`、`is-warning`、`mod-checked`)。見た目はObsidianのCSSとテーマに従う。
- `addItem`、`addSeparator`(先頭と連続の区切り線を出さない)、`setParentElement`(開いている間 `has-active-menu`)、`onHide`、`showAtMouseEvent`、`showAtPosition`、`hide`。
- 項目: `setTitle`、`setIcon`、`setChecked`、`setDisabled`(キー操作で飛ばす)、`setWarning`、`setKeepOpen`、`onClick`。開いている間に見た目を変えても反映される。
- 表示する文書: イベントの `doc` → 親要素の `ownerDocument` → 今の文書の順。別ウィンドウのパレットでもそのウィンドウに出る。
- 位置: マウスの位置に出し、右端・下端からはみ出すときは左・上に寄せる(`placeMenu`、純粋関数)。
- キー操作: `↑` / `↓` / `Home` / `End`(無効の項目を飛ばす)、`Enter` / `Space` で実行、`Esc` で閉じる。文書の捕捉段階で受けてキーを消費するので、パレットへ届かない。`selectFirst` で先頭の項目を選んで開ける。
- 閉じる契機: 項目の実行(`setKeepOpen` の項目を除く)、`Esc`、外側の押下、ウィンドウのリサイズ・フォーカス喪失。閉じたら、ほかの要素がフォーカスを取っていなければ開く前の要素へ戻す。

### 使う前に足すもの

置き換えの最初のコミットで、次を `paletteMenu.ts` に足す。

| 足すもの                                                                               | 理由                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `close()`(`hide()` と同じ)                                                             | 今のコードは15か所で `activeMenu?.close()` を呼んでいる。Obsidianの `Menu` と同じ名前を持たせ、呼び出し側の変更を型と生成だけに抑える                                        |
| `setCta(cta: boolean)`(`mod-cta` クラス)                                               | 履歴消去の確認待ちを、ボタンの `setDestructive().setCta()` と同じ「赤い背景に白い文字」にする。色は `is-warning` と組み合わせたときだけ赤にし、CSSはObsidianの色の変数を使う |
| ARIA(`role="menu"` / `menuitem` / `menuitemcheckbox`、`aria-disabled`、`aria-checked`) | スクリーンリーダーで項目の種類と状態がわかるようにする                                                                                                                       |
| 開いているメニューを開き直したときの `onHide` の扱い                                   | 今は `showAtPosition` の先頭の `hide()` が、登録済みの `onHide` を呼んで消してしまう。開き直しでは呼ばずに残す                                                               |
| 単体テスト                                                                             | `placeMenu` の位置、キー操作で無効の項目を飛ばすこと、`setKeepOpen` の項目で閉じないこと、外側の押下で閉じること                                                             |

### 置き換える場所

パレットとその選択画面が自分で開く7か所を置き換える。

| ファイル                     | メニュー                                       |
| ---------------------------- | ---------------------------------------------- |
| `PaletteModal.ts`            | 結果の右クリックメニュー                       |
| `PaletteView.ts`(2か所)      | 結果の右クリックメニュー、出典ノートのメニュー |
| `PaletteHistoryControls.ts`  | `…` メニュー                                   |
| `PaletteTableControls.ts`    | 列のメニュー                                   |
| `MultiSelectModal.ts`(2か所) | タグ・MOCの選択画面のメニュー                  |

- `PaletteView.onPaneMenu`(サイドバーのペイン右上のメニュー)はObsidianが作って渡すメニューなので、Obsidianの `Menu` のまま残す。
- メニューに項目を足す関数(`populatePaletteResultMenu`、`tabMenu.ts`、`mocInsertion.ts`、`mocRelateds.ts`、`pathClipboard.ts`)は、引数の型を `Menu` から `PaletteMenu` に変える。
- `src/ui/menus.ts` は、`markKeyboardMenuEvent` と `showMenuAtEvent`(キーボードで開いたら `selectFirst` を渡すだけ)を残し、非公開APIの書き換え(`consumeEscape`、`selectFirstItem`)を消す。
- 行を押したときにメニューを閉じる処理(`PaletteModal` と `PaletteView` の `onResultFocus` の `activeMenu?.close()`)を消す。回帰テスト(`history-and-menus.spec.mts` の「pressing a result row closes the open result menu」)はそのまま通ることを確かめる。

### 確かめること

- Escで閉じたとき、モーダルが閉じない・サイドバーの入力が消えないこと(今の `menus.ts` が防いでいる問題)。Obsidianのキー処理が文書の捕捉段階より前に動かないかを、既存のE2E(`38a6857` で足したもの)で確かめる。
- 撮影タスクで、Obsidianのメニューと並べて見た目が同じであること(チェックの位置、無効の見出し、区切り線)。
- Obsidianの「ネイティブメニュー」設定をオンにしても、パレットのメニューが同じ見た目と動作になること。

## UI撮影タスク

minimalshot の `.vscode/tasks.json` と `scripts/readme/capture-screenshots.mjs` と同じ形で、すべての画面を一括で撮影するタスクを追加する。

### 実行の流れ

```text
VS Code: Tasks: Run Task → My Palette: Capture UI screenshots
  ↓
pnpm ui:shots --open
  ↓
scripts/screenshots/capture-screenshots.mjs
  ビルド → プラグインの配置(e2e/prepare-plugin.mjs) → Playwright(playwright.screenshots.config.mts)
  ↓
撮影先に run-xxxx フォルダーを作って保存 → 成功したらエクスプローラーで開く
```

- 撮影先は `UI_SHOT_DIR`(既定はOSの一時フォルダー配下の `my-palette-ui-screenshots`)。実行ごとに `run-` で始まる新しいフォルダーを作り、画像ビューアで前回の画像を開いたままでも撮影できるようにする(minimalshot と同じ)。
- `ELECTRON_RUN_AS_NODE` が環境に残っているとElectronが起動しないため、スクリプトで取り除いてからPlaywrightを起動する。
- 既存の `pnpm readme:shots`(Raycast方式のナビゲーションの撮影)は、この仕組みに統合する。
- 撮影はテストではないので、通常の `pnpm e2e` からは外す(設定ファイルを分ける)。

### 撮影する画面

ダークテーマで、1100×760を基本にする(設定画面は別ウィンドウなので、そのウィンドウを撮る)。

| 区分                 | 画面                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| パレット(モーダル)   | ルート(空、エイリアス入力中)、各モードの画面(8モード)、ファイル専用モード、`…` メニュー(通常、消去の確認待ち)、結果の右クリックメニュー、検索履歴、ヘルプ |
| サイドバー・テーブル | ルート、モードに入った状態、テーブルの並べ替え                                                                                                            |
| 選択画面             | タグ挿入、MOCへのリンク挿入(Mutual / Ignored のスイッチ付き)、移動先フォルダー、パスを開く                                                                |
| 設定画面             | General、Modes、File search、Shortcuts(通常、記録中、重複エラー)、Integrations(一覧、Everything、VS Code)                                                 |

- 画面ごとにファイル名を `01-palette-root.png` のように番号付きにして、並び順で見比べられるようにする。
- Everything は実機が無くても撮れるように、接続エラーの画面を撮る(接続できる環境なら結果が写る)。
- Smart Connections は入っていない前提で、案内の画面を撮る。

## 実装手順(コミット単位)

v1の手順1〜4(移行、エイリアスと有効/無効、フッターのスイッチ、新しいホットキー)はそのまま使う。画面の手順を次のように置き換える。撮影タスクは、以降の手順で画面を確かめるために最初に入れる。

1. `chore`: UI撮影タスク(`.vscode/tasks.json`、`pnpm ui:shots`、撮影スクリプト)。まず今ある画面を撮る。
2. `refactor`: `paletteMenu.ts` に `close()`・`setCta()`・ARIAを足し、7か所のメニューを `PaletteMenu` に置き換える。見た目と動作は変えない。`src/ui/menus.ts` の非公開APIの書き換えと、行を押したときにメニューを閉じる処理を消す。
3. `refactor`: エイリアスの保存先を `modes.<id>` に移し、スキーマを19に上げて移行する。
4. `feat`: 全モードのエイリアスと有効/無効を保存・反映できるようにする(画面はModesページで追加)。
5. `refactor`: フッターのスイッチが任意のホットキーを受け付けるようにし、重複検査に「使える場所」を入れる。
6. `feat`: `Toggle Obsidian-excluded files`、`Toggle Mutual`、`Enter mode` のホットキーを設定できるようにする。
7. `feat`: `…` メニューの並びを変え、その画面の検索履歴を2回押して消す項目を足す。
8. `feat`: Shortcutsページの表。旧Hotkeysページを置き換える。
9. `feat`: Modesページ。
10. `feat!`: General / File search に組み直し、画面に無かった設定を出す。旧Palette・Vault file search ページを置き換え、設定画面から履歴の消去を外す。
11. `feat`: Integrations ページ(1連携1行のスイッチと、Everything の編集モーダル)。連携の有効/無効を保存し、無効な連携のモードを外す。旧Everythingページを置き換える。最初に、別ウィンドウの設定画面でモーダルが設定ウィンドウ側に開くかを試し、開かなければサブページに切り替える。
12. `feat!`: `Open palette` の状態復元と Pop to Root Search。`Remember last input` を廃止して移行する。
13. `docs`: README / README.ja / 詳細仕様を更新する。

手順2以降は、各手順の最後に撮影タスクを実行し、変わった画面を見て確かめる。

## テスト

v1のテストに次を足す。

- 設定ページの構成: General / Modes / File search / Shortcuts / Integrations の順、Integrations の行は Everything / Smart Connections / VS Code。
- Modes: エイリアスの変更と検査エラー、無効にしたモードがルートの行とエイリアス入力から消えること。
- Integrations: 行のスイッチで連携を切ると、そのモードがRoot Searchとエイリアス入力から消え、Modes ページの行が押せなくなること。VS Code のスイッチで外部Markdownを開くアプリが変わること。Everything の名前でモーダルが開き、変更がその場で保存されること。
- 設定の検索で、モーダルの中の項目名(例: `Request timeout`)を入れると Everything の行が見つかること。
- 別ウィンドウの設定画面で、Everything のモーダルが設定ウィンドウの側に開き、閉じると名前のボタンへフォーカスが戻ること。
- `…` メニュー: 並び順、1回目で確認待ちの見た目に変わり履歴が残ること、2回目で消えること、確認待ちのまま閉じると次は1回目に戻ること、キーボードで開いたときの選択位置。
- 履歴の消去はその画面のカテゴリーだけに効くこと(パレットで消してもタグ挿入の履歴は残る)。
- 自前のメニュー: キー操作(無効の項目を飛ばす、Home / End、Escを消費する)、外側の押下で閉じる(結果の行を含む)、はみ出し時の位置、閉じたあとのフォーカス、別ウィンドウのパレットでそのウィンドウに出ること。
- Obsidianの「ネイティブメニュー」設定をオンにしても、パレットのメニューが同じ見た目と動作になること。

## 決めたいこと

| 項目                       | 推奨                                                                      | 代案                                                     |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| 画面の分け方               | 目的別の5ページ(General / Modes / File search / Shortcuts / Integrations) | Raycastと同じくコマンドグループ別                        |
| Integrations の各連携      | minimalshot と同じ(1行に名前とスイッチ、名前でモーダル)                   | 宣言的APIのサブページ(スイッチは1つ奥)                   |
| 連携の有効/無効            | Integrations のスイッチで連携ごと切り、Modes で各モードを個別に切る       | Modes のスイッチだけにする                               |
| Smart Connections          | 有効/無効のスイッチを持つので Integrations に出す                         | 出さない                                                 |
| 履歴を消す範囲             | その画面の履歴だけ                                                        | どの画面からでもすべての履歴                             |
| メニュー                   | `paletteMenu.ts` で7か所すべてを置き換える                                | `…` メニューだけ置き換え、ほかはObsidianのメニューのまま |
| `Highlight search matches` | メニューに残す(Generalにも出す)                                           | 設定画面だけにする                                       |
