# Raycast方式ナビゲーション移行計画

入力欄にプレフィックスを残し続ける方式(`esdir report`)を、Raycastのような「ルート検索 → モード画面 → Escで戻る」というナビゲーションスタック方式に置き換える。

## 用語

| 用語                   | 意味                                                           | Raycastでの名前           |
| ---------------------- | -------------------------------------------------------------- | ------------------------- |
| ルート                 | パレットを開いた直後の画面。モードの入口とファイルを並べる     | Root Search               |
| モードエントリ         | ルートに並ぶ、モードへ入るための行(`esdir`、`e`、`>`など)      | Command(Root Searchの1件) |
| モード画面             | モードに入ったあとの検索画面。入力欄の左にモードのチップを出す | Command View              |
| エイリアス             | モードエントリを呼び出す短い文字列。旧プレフィックス           | Alias                     |
| ナビゲーションスタック | `ルート → モード画面` の2段。Escで1段戻る                      | Navigation stack          |

## 現状の整理

- 入力の解釈は `src/palette/inputParser.ts` の `parseInput()` に集約されている。生入力からモード・Everythingの範囲・検索語を毎回作る。
- `parseInput()` の利用箇所: `PaletteSearchSession`、`searchHistory.ts`(旧履歴の変換)、`mocRelateds.ts`(MOC選択でfile以外を空にする)。
- プレフィックスを文字列で組み立てる箇所: `formatSearchHistoryInput()`、`PaletteOpener.commandPaletteInitialInput()`、`PaletteModal.getInitialInputSelectionRange()`、`PaletteHelpModal`、README。
- 生入力を保存・複製する箇所: `PaletteOpener.rememberQuery()`(fileとeverythingは生入力)、`PaletteView` の永続状態 `input`、`PaletteModal.moveToSidebar()`。
- 履歴は既に `category + query` で保存しているため、保存形式は変更しなくてよい。復元時にプレフィックスを付けて入力欄へ戻す処理だけを変える。
- 既存の不整合: ヘルプとREADMEは `esdir` を「現在のノートのディレクトリ」と説明しているが、実装(`buildEverythingQuery`)はどちらの範囲もVaultルートで、`esdir` は拡張子フィルタを外すだけになっている。今回の名前変更に合わせて説明を実装に揃える。

## 目標の操作フロー

```text
パレットを開く
  ↓
ルート(モードエントリ + ファイル)
  ↓ モードエントリでEnter / Tab、またはエイリアス+Space
モード画面(チップ: esdir、入力欄は空)
  ↓ Esc
ルート(入力欄 = "esdir" を全選択、esdirのエントリがアクティブ)
  ↓ Esc
閉じる(サイドバー/テーブルは既存どおり「クリア → フォーカス」)
```

### ルート

- 入力が空のとき: 上に「Modes」セクション(モードエントリ全件)、下に「Files」セクション(最近使ったファイル、現在の空入力と同じ並び)。
- 入力があるとき: エイリアスに完全一致するエントリを先頭にし、エイリアスの前方一致とタイトルのあいまい一致でエントリを絞り込む。その下にファイル検索の結果を並べる。
    - 例: `esdir` と入力すると先頭行が `esdir` のエントリになり、Enterでそのモードへ入れる。
    - エントリが1件も一致しなければ、ファイル結果だけを出す(セクション見出しも出さない)。
- ファイル行のEnter/ダブルクリック/右クリックなどは既存のファイル検索と同じ。
- Ignoredスイッチは「Files」セクションに効く(モードエントリには影響しない)。

### モードエントリの表示(すべて英語)

| エイリアス(バッジ) | タイトル                  | サブタイトル      | アイコン(Lucide)  |
| ------------------ | ------------------------- | ----------------- | ----------------- |
| `>`                | Run Command               | Obsidian          | `terminal-square` |
| `e`                | Search Vault Notes        | Everything        | `search`          |
| `esdir`            | Search All Files in Vault | Everything        | `folder-search`   |
| `o`                | Search Outgoing Links     | Current note      | `arrow-up-right`  |
| `b`                | Search Backlinks          | Current note      | `arrow-down-left` |
| `bk`               | Search Bookmarks          | Obsidian          | `bookmark`        |
| `sc`               | Search Related Notes      | Smart Connections | `sparkles`        |
| `t`                | Switch Tab                | Workspace         | `panel-top`       |

- 行の構成: アイコン / タイトル / サブタイトル(淡色) / 右端にエイリアスのバッジ。
- `e` と `esdir` の名前は実装に合わせた。`e` はVaultの対象拡張子だけ、`esdir` はVault配下の全ファイル種別を検索する。
- `>` と `e` のエイリアスは既存設定(`prefixes.command` / `prefixes.everything`)を使う。設定値の末尾スペースは意味を持たなくなるので、読み込み時に `trimEnd()` する。
- 現在のノートに依存するモード(`o`、`b`、`sc`)は、アクティブなノートが無いときもエントリを出し、入った先で既存のエラー表示を使う。

### モード画面

- 入力欄の左にチップ(アイコン + エイリアス)を出し、入力欄は検索語だけになる。プレースホルダはモードごとの既存文言(`palettePlaceholder`)を使う。
- チップをクリックするとルートへ戻る(Escと同じ)。
- 入力が空でカーソルが先頭にあるときのBackspaceでもルートへ戻る。Raycastと同じく、空入力で消し続けたときに自然に1段戻れるようにする(下記「決めたいこと」参照)。
- 検索・結果・アクション・プレビューは既存の各モードのまま。

### Escの規則

| 場所                                       | Esc                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| モード画面                                 | ルートへ戻る。入力欄にエイリアスを入れて全選択し、そのエントリをアクティブにする |
| ルート(モーダル)                           | 閉じる(既存)                                                                     |
| ルート(サイドバー/テーブル)                | 入力をクリア、次にフォーカス(既存)                                               |
| メニュー・履歴ポップアップを開いているとき | それだけを閉じる(既存の `38a6857` の挙動を維持)                                  |

### コマンドとの対応

| コマンド                       | 開く画面                                 | Escの戻り先 |
| ------------------------------ | ---------------------------------------- | ----------- |
| 新規: `Open palette`           | ルート                                   | 閉じる      |
| `Open Recent palette`(`open`)  | ファイル専用モード(エントリなしのルート) | 閉じる      |
| `Open command list`            | `>` モード                               | ルート      |
| `Link search` などの固定モード | 該当モード                               | ルート      |

- 「ファイル専用モード」はモードエントリを出さないだけのルートで、チップは出さない。ユーザーが既に割り当てている `open` のホットキー(Ctrl+P)の意味を変えないため、`open` をこちらに割り当てる。
- 固定モード(`fixedMode`)は「その画面から開始する」に意味を変え、Escでルートへ戻れるようにする。戻れない固定は作らない。

## 内部設計

### モード定義の一元化

`src/palette/modes.ts` を新設し、各所に散っているプレフィックス・タイトル・アイコン・プレースホルダ・履歴カテゴリを1つの表にまとめる。

```ts
export type PaletteModeId =
	| "commands"
	| "everything"
	| "everything-all"
	| "outlinks"
	| "backlinks"
	| "bookmarks"
	| "smart"
	| "tabs";

export interface PaletteModeDefinition {
	id: PaletteModeId;
	mode: Exclude<PaletteMode, "file">;
	everythingScope?: EverythingScope;
	title: string;
	subtitle: string;
	icon: string;
	placeholder: string;
	historyCategory: SearchHistoryCategory;
}

export function paletteModeAliases(prefixes: Prefixes): Record<PaletteModeId, string>;
export function matchPaletteModes(input: string, prefixes: Prefixes): PaletteModeDefinition[];
```

### 画面の状態(ルート)

```ts
export type PaletteRoute =
	| { kind: "root"; showModes: boolean } // showModes=false がファイル専用モード
	| { kind: "mode"; modeId: PaletteModeId };
```

- `PaletteSearchSession` が `route` と `query` を持つ。`search(input)` は生入力の解釈をやめ、`route` から provider を決める。
- ルートの検索は、モードエントリの照合結果とFileProviderの結果を連結する。
- 状態遷移: `enterMode(modeId, query = "")`、`returnToRoot()`(戻り先の入力 = エイリアス)を追加する。モーダルとビューの両方で同じ遷移を使えるよう、遷移の規則はセッション側に置く。
- `parseInput()` は「旧形式の文字列 → route + query」の変換専用(`parseLegacyInput`)に縮める。用途は旧履歴、旧ビュー状態、貼り付け入力、エイリアス+Spaceの判定。

### 結果型

`PaletteResult` に `ModeEntryResult` を追加する。

```ts
export interface ModeEntryResult extends BaseResult {
	mode: "mode-entry";
	modeId: PaletteModeId;
	alias: string;
}
```

- `executePaletteResult`: 実行せず、ホストに `enterMode` を依頼する(履歴の `search-history` と同じく、ホスト側で先に分岐する)。
- `resultPresentation`: タイトル/サブタイトル/バッジ(エイリアス)を返す。既存の `SelectionItem.badge` を使う。
- 右クリックメニュー・中クリック・プレビュー・複数選択のコピー: モードエントリは対象外にする。
- `getResultFilePath`: `undefined`。

### SuggestionPanel

- 入力欄の左に置くモードチップ: `setModeChip(chip?: { icon: string; label: string })`。クリックで `onModeChipClick` を呼ぶ。
- セクション見出し: 結果に `section?: string` を持たせ、見出しは `role="presentation"` の非選択行として描画する。キーボードの上下移動と範囲選択は見出しを数えない(`chooser.values` には入れない)。
- Backspace(空入力・先頭)とEscはホストへ通知する `onBackspaceAtStart` / 既存の `onEscape`。

### テーブル表示

テーブルは列がファイル向けで、モードエントリを行として出すと列が意味を持たない。テーブルのルートではエントリを出さず、エイリアス+Space(または貼り付け)だけでモードへ入れるようにする。チップとEscの規則はリストと同じ。

### 互換性・移行

- 履歴: 保存形式は変えない。復元は `formatSearchHistoryInput()` の文字列組み立てをやめ、`category → route` と `input → query` を直接適用する。
- `rememberQuery`: 生入力ではなく `{ route, query }` を記憶する。
- `PaletteView` の永続状態: `route` を追加する。`route` が無い旧状態は `input` を `parseLegacyInput()` で変換する。
- `moveToSidebar`: 生入力ではなく `route + query` を渡す。
- MOC Relateds選択: `parseInput()` を使わず、入力をそのままファイル検索語として扱う(選択画面にモードは無いため)。
- 設定: `prefixes` のキー名はそのまま残し、設定画面の表記を「Alias」に変える。重複・包含の検査(`validatePrefixes`)は維持する。
- エイリアス+Space: ルートで入力がちょうど `エイリアス + " "` になった時点でモードへ入る。旧来の指の動き(`> `、`e `)と、`openPaletteWith("esdir report")` のような貼り付け・E2Eの入力を壊さない。IME変換中(`isComposing`)は判定しない。

## 実装手順(コミット単位)

各コミットの前に `vp check` と `vp test` を通す。移動・分割・挙動変更を同じコミットに混ぜない(`REFACTORING_ROADMAP.md` の方針)。

1. `refactor`: `src/palette/modes.ts` にモード定義を集約し、`inputParser`、ヘルプ、`searchHistory` のプレフィックス組み立てを置き換える。挙動は変えない。単体テストを追加。
2. `refactor`: `PaletteSearchSession` に `route` を導入する。この段階ではホストから生入力を受け、内部で `parseLegacyInput()` して `route` を作る。挙動は変えない。
3. `feat`: `SuggestionPanel` にモードチップとセクション見出しを追加する(まだ誰も使わない)。
4. `feat`: `ModeEntryResult` とルート検索(エントリ + ファイル)を追加し、モードエントリのEnter/Tab/エイリアス+Spaceでモードへ入る。モーダルとサイドバーの入力欄からプレフィックスが消える。
5. `feat`: Esc・チップクリック・空入力Backspaceでルートへ戻り、エイリアスを全選択する。
6. `feat!`: コマンドの割り当てを変える(新規 `Open palette`、`open` はファイル専用モード、command listと固定モードはEscでルートへ戻る)。
7. `feat`: 履歴の復元、`rememberQuery`、ビューの永続状態、`moveToSidebar` を `route + query` に移行し、旧状態を変換する。
8. `refactor`: MOC Relateds選択から `parseInput()` を外す。
9. `docs`: README / README.ja / ヘルプ / `DETAILED_SPECIFICATION.md` を更新する。`esdir` の説明を実装に合わせる。

## テスト

### 単体テスト

- `modes.test.ts`: エイリアスの完全一致が先頭、前方一致・タイトル一致、設定エイリアスの反映、末尾スペースの除去。
- `PaletteSearchSession`: `enterMode` / `returnToRoot` の遷移、戻ったときの入力がエイリアスになること、ルート検索でエントリとファイルが両方出ること、ファイル専用モードでエントリが出ないこと。
- `parseLegacyInput`: 旧入力(`esdir report`、`> foo`、`bk `)の変換。
- `searchHistory`: 履歴の適用結果が `route + query` になること(既存の `formatSearchHistoryInput` テストを置き換え)。
- `PaletteView` の状態正規化: 旧 `input` からの移行。
- `SuggestionPanel`: 見出しを飛ばす上下移動と範囲選択、チップのクリック、空入力Backspace。

### E2E

- 既存の `modes.spec` / `everything.spec` / `preview-transparency.spec` / `history-and-menus.spec` は、エイリアス+Space(貼り付け)経路で通ることを確認し、必要な箇所だけ直す。
- 追加: `esdir` と入力 → 先頭エントリでEnter → チップ表示と空入力 → 検索 → Escでルートへ戻り `esdir` が全選択されている → もう一度Escで閉じる。
- 追加: `Open command list` から開いたときにEscでルートへ戻る。
- 追加: `open`(ファイル専用モード)でモードエントリが出ない。

## 決めたいこと

計画は「推奨」列の案で進める前提にしている。違えば実装前に直す。

| 項目                                         | 推奨                                                                 | 代案                                                          |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| ルートとファイル専用モードのコマンド割り当て | 新規 `Open palette` をルートにし、既存の `open` はファイル専用モード | `open` をルートに変え、ファイル専用モードを新規コマンドにする |
| エイリアス+Spaceでの即時移動                 | 残す(旧来の操作と貼り付けを壊さない)                                 | 廃止してEnter/Tabだけにする                                   |
| 空入力でのBackspace                          | ルートへ戻る                                                         | 何もしない(Escとチップだけ)                                   |
| `Open command list` からのEsc                | ルートへ戻る                                                         | 直接閉じる                                                    |
| テーブル表示のルート                         | エントリを出さない                                                   | エントリ行を出す                                              |
| エントリ名                                   | 上表のとおり                                                         | 別案があれば差し替え                                          |
