# リファクタリング・ロードマップ

旧ロードマップ(Phase 0〜6)の構造整理は完了している。このファイルは、その後の実コードを確認して残った課題だけを扱う。

## 完了済みの整理(再作業しない)

- `src/core` を `ignored-notes` / `platform` / `shared` / `palette` へ分離済み
- 未使用モジュールの削除済み
- `PaletteModal` の責務分割済み(結果表示、アクション振り分け、履歴コントローラ、バックグラウンドオープン)
- 永続パレットビュー(`PaletteView` / `PaletteTableView`)と `SuggestionPanel` の共有化済み
- `main.ts` から Provider 生成、コマンド登録、イベント登録、外部 Markdown、設定ロード・保存を分離済み
- `settings` のモデル、`mergeSettings`、設定画面定義の分離済み
- Provider は `src/search/<機能>/` 単位に整理済み

## 方針

- 移動、責務分割、挙動変更を同じコミットに混ぜない
- 共通化は、変更理由と不変条件が同じ処理に限る
- 抽象化のためだけの Base class は追加しない
- 各コミットの前に `vp check`、`vp test --run`、`pnpm check-types` を実行する
- 分割した純粋ロジックには単体テストを付ける

## 課題

### 1. 重複した型とロガー(リスク最小)

- [x] `Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">` を `FixedPaletteMode`(`src/palette/PaletteSearchSession.ts`)に置き換える(`main.ts` に6箇所)
- [x] `(message, detail) => logger.debug(message, detail)` を `main.ts` 内で1つにまとめる(6箇所)
- [x] `PaletteView.ts` のインライン `import("obsidian").TFile` を `import type` に直す

### 2. `main.ts` の純粋ロジックの切り出し

- [x] `formatSearchHistoryInput` を、category から prefix を引く純関数にして `src/palette/searchHistory.ts` へ移し、テストを追加する
- [x] `recordResultUsage` のパス抽出を `getResultFilePath(result)` として `src/palette/results.ts` に切り出し、テストを追加する

### 3. `main.ts` の責務の縮小

`main.ts` は Plugin のライフサイクルと依存の組み立てに集中させる。

- [x] 検索履歴と最近のコマンドの「store があれば store、無ければ legacy 配列」という分岐を、小さなサービスにまとめる
    - 対象: `legacySearchHistoryEntries`、`legacyRecentCommandIds`、`syncLegacy*Fallback`、`recordSearch`、`recordCommand`、`clearSearchHistory`、`getSearchHistorySuggestions`
    - 不変条件: IndexedDB が使えないときは、legacy ペイロードを `data.json` に残し、設定保存で履歴が消えない
- [x] パレットを開く処理(`openPalette*`、`paletteViewState`、`focusPaletteView`、`rememberedPaletteQueries`)を `src/app/` の `PaletteOpener` へ移す
- [x] `openNewPaletteView` などの位置引数が増えた箇所をオプションオブジェクトに変える(上の `PaletteOpener` 化と同時に行う)

### 4. `PaletteView.ts`(約690行)の分割

- [x] 対象リーフの追跡(`registerTargetLeafTracking`、`findTargetLeaf`、`resolveTargetLeaf`、`isCenterLeaf`、`fileOf`)を分離する
- [x] ソースピンのボタン(`SourcePinControl`)を分離する。ピン状態の更新(`toggleSourcePin`、`updateSource`)は `pendingState` と結びついているため `PaletteView` に残す
- [x] ファイル一覧の更新タイマー(`registerFileListRefresh`、`scheduleFileListRefresh`)を分離する
- [x] `PaletteView` は ItemView のライフサイクル、状態の保存、各部品の接続に集中させる。結果の実行とコンテキストメニューの組み立て(`execute`、`showContextMenu`)は、まだ `PaletteView` に残っている。変更の必要が出たときに分ける

### 5. 設定画面と Plugin 本体の依存

- [x] `settingPages.ts` が受け取る型を `SettingsHost`(必要な操作だけのインターフェース)に絞る。`settingTab.ts` は `PluginSettingTab` の継承に Plugin 本体が必要なので、そのまま残す

### 6. 重複の確認(調査から)

- [x] `src/ui/suggestionPanel.ts` と `src/ui/MultiSelectModal.ts` の重複を確認した。`MultiSelectModal` は `BaseSuggestModal` 経由でパネルを使い、チェック状態は `MultiSelectModal` だけが持つため、重複はなく現状維持とする

## テストの不足(必要になった時点で補う)

- [x] `schemaVersion` と保存判断(`settingsStore.test.ts`)
- [x] ignored note: 存在しない除外フォルダのスキップ(`ignoredNoteScanner.test.ts`)
- [ ] ignored note: キャッシュ再利用条件(`IgnoredNoteIndex` は IndexedDB を直接開くため、`fake-indexeddb` などを導入するか、永続化層を分離しないとテストできない)
- [x] staleな非同期検索結果の破棄(`suggestionSurfaces.test.ts` で網羅済み)

## 動作確認(E2E)

`pnpm e2e`(`e2e/` 配下、Playwright と obsidian-e2e-toolkit)で、実際の Obsidian を起動して確認する。

- [x] 通常ファイル検索、Enter で開く(`file-search.spec.mts`)
- [x] `i ` の ignored note 検索と、外部ファイルとして開く要求(`ignored-notes.spec.mts`)
- [x] Everything 検索の要求クエリ(`everything.spec.mts`)。結果行の表示は、プラグインが Windows 形式のパスだけを受け付けるため Linux では検証できない
- [x] command、bookmark、link、backlink、smart 検索(`modes.spec.mts`)。smart は Smart Connections が無い場合の表示のみ
- [x] 履歴表示と履歴復元、右クリックメニュー、中クリック(`history-and-menus.spec.mts`)
- [x] MOC Relateds へのリンク追加、タグの複数選択と挿入(`moc-and-tags.spec.mts`)
- [ ] ignored Markdown を外部ファイルのビューとして開く。ツールキット同梱の Obsidian 1.13.7 は `file:` 形式を開けないため、テストはスキップされる。対応した Obsidian では自動で実行される
- [ ] Smart Connections 本体がある環境での smart 検索
- [ ] Windows 上での Everything の結果表示

## ドキュメント

- [x] `docs/DETAILED_SPECIFICATION.md` の構成図と責務表を現状に合わせた。以後、構成を変えるたびに更新する
