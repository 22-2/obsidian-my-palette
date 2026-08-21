# リファクタリング・整理整頓ロードマップ

## 目的

- [ ] ファイル数が増えても、変更理由ごとの責務が追いやすい構成にする
- [ ] 検索・設定・ignored note・UI・Obsidian依存部分の境界を明確にする
- [ ] 挙動を維持したまま、共通化できる処理だけを共通化する
- [ ] 大きな差分を避け、各段階でテスト可能なコミットに分ける

## 基本方針

- [ ] 先にすべてのテストを完成させるのではなく、壊れると困る境界をテストで固定してから整理する
- [ ] ファイル移動・責務分割・挙動変更を同じコミットに混ぜない
- [ ] 共通化は「似ている」だけでなく、変更理由と不変条件が同じ処理に限定する
- [ ] UIの抽象化を優先せず、純粋ロジックと外部依存の境界を先に作る
- [ ] 各コミット後にテストと型チェックを実行する

## 現在の基準値

調査時点の状態を整理作業の比較基準にする。

- [x] `vp test --run` が成功する（9ファイル、39テスト）
- [x] `pnpm check-types` が成功する
- [x] `vp check` を成功させる
- [x] 整理開始前のGitワークツリーがcleanである

## Phase 0: 基準値とフォーマットの固定

### 作業

- [x] `vp check --fix` を実行する
- [x] フォーマット変更だけを確認する
- [x] 実行結果を確認する
    - [x] `vp check`
    - [x] `vp test --run`
    - [x] `pnpm check-types`

### 完了条件

- [x] フォーマット変更に機能変更が混ざっていない
- [x] `vp check`、`vp test --run`、`pnpm check-types` が成功する
- [x] 後続作業はフォーマット差分を含まない

### コミット案

```text
chore: format existing sources

- apply the repository formatter
- keep runtime behavior unchanged
```

## Phase 1: 未使用コードと古い仕様記述の整理

### 作業

- [x] `src/core/strings.ts` の参照元を確認し、未使用なので削除する
- [x] `src/ui/ResultList.ts` の参照元を確認し、未使用なので削除する
- [x] `src/ui/statusMessage.ts` の参照元を確認し、未使用なので削除する
- [x] `docs/DETAILED_SPECIFICATION.md` の古い構成図を現状に合わせる
- [x] 削除後にビルドエントリから参照されていないことを確認する

### 完了条件

- [x] 未使用ファイルが削除されている
- [x] 仕様書に存在しないファイルや古い構成が残っていない
- [x] `vp test --run` が成功する
- [x] `pnpm check-types` が成功する

### コミット案

```text
chore: remove unused modules

- remove modules with no runtime imports
- update the architecture specification to match the source tree
```

## Phase 2: 高リスク領域の振る舞いをテストで固定

テスト対象を増やしてから、ディレクトリ移動と責務分割を始める。

### 設定

- [x] `mergeSettings` のデフォルト補完をテストする
- [x] 不正な型・範囲外の数値をデフォルトへ戻すことをテストする
- [x] prefix変更後の履歴分類をテストする
- [x] 古い履歴データの読み込みとカテゴリ補完をテストする
- [ ] `schemaVersion` と保存判断をテストする

対象: `src/settings/mergeSettings.ts`、`src/model/settings.ts`

### ignored note

- [x] 通常の除外フォルダ判定をテストする
- [x] 正規表現形式の除外フィルターをテストする
- [x] 壊れた正規表現を安全に扱うことをテストする
- [ ] 存在しない除外フォルダをスキップすることをテストする
- [ ] キャッシュ済みエントリの再利用条件をテストする
- [ ] 同じノートを二重importしないことをテストする
- [ ] 同名ファイルの衝突時に決定的なsuffixを付けることをテストする
- [ ] frontmatterを既存・新規の両方で正しく追加することをテストする
- [ ] dot-folder由来のパスをlink可能な表示先へ変換することをテストする

対象: `src/ignored-notes/ignoredPaths.ts`、`src/ignored-notes/ignoredNoteIndex.ts`、`src/ignored-notes/ignoredNoteMaterializer.ts`

### 結果アクションとモード振り分け

- [ ] 通常のVaultファイルの開き先をテストする
- [ ] ignored noteの開き先をテストする
- [ ] Markdown・非Markdown・Everything結果の分岐をテストする
- [ ] command、bookmark、link、backlink、smartのアクション分岐をテストする
- [ ] staleな非同期検索結果を破棄することをテストする

対象: `src/palette/PaletteModal.ts`、`src/palette/resultActions.ts`

### 完了条件

- [ ] 高リスク領域の仕様がテスト名から読める
- [ ] テストはUI操作全体ではなく、まず純粋関数・分岐・変換を中心にしている
- [ ] `vp test --run` が成功する
- [ ] `pnpm check-types` が成功する

### コミット案

```text
test: characterize settings and ignored note behavior

- cover malformed settings and history migration
- cover ignored path indexing and idempotent materialization
- preserve current behavior before structural refactoring
```

## Phase 3: `core` の責務を分離

`core` をさらに大きくするのではなく、変更理由が異なるものを分ける。

### 移動案

- [x] `src/core/ignoredPaths.ts` → `src/ignored-notes/ignoredPaths.ts`
- [x] `src/core/ignoredNoteIndex.ts` → `src/ignored-notes/ignoredNoteIndex.ts`
- [x] `src/core/ignoredNoteMaterializer.ts` → `src/ignored-notes/ignoredNoteMaterializer.ts`
- [x] `src/core/desktopAdapter.ts` → `src/platform/desktopAdapter.ts`
- [x] `src/core/vscode.ts` → `src/platform/vscode.ts`
- [x] `src/core/pathClipboard.ts` → `src/platform/pathClipboard.ts`
- [x] `src/core/pathDisplay.ts` → `src/shared/pathDisplay.ts`
- [x] `src/core/externalFiles.ts` → `src/shared/externalFiles.ts`
- [x] `src/core/searchHistory.ts` → `src/palette/searchHistory.ts`

### ルール

- [x] 移動コミットではロジックを変更しない
- [x] テストファイルも実装と同じディレクトリへ移動する
- [x] import pathの変更だけで済ませる
- [x] 移動後に `rg` で古いimport pathが残っていないことを確認する

### 完了条件

- [x] `src/core` が空、または明確な共通処理だけになっている
- [x] ignored noteの処理が一つの機能領域として追える
- [x] Obsidian/Electron依存の処理が `platform` に集約されている
- [x] `vp test --run` と `pnpm check-types` が成功する

### コミット案

```text
refactor: separate core modules by responsibility

- move ignored note logic into its feature boundary
- move desktop and path integrations into platform modules
- keep runtime behavior unchanged
```

## Phase 4: 大きなファイルを責務ごとに分割

### `PaletteModal.ts`

- [x] 結果を`SelectionItem`へ変換する処理を分離する
- [x] 結果ごとの表示バッジ判定を分離する
- [ ] 結果アクションの振り分けを分離する
- [ ] 検索履歴のイベント登録と遅延保存を分離する
- [x] バックグラウンドオープン処理を分離する
- [ ] `PaletteModal` は入力・選択状態・検索世代管理に集中させる

対象: `src/palette/PaletteModal.ts`

### `main.ts`

- [x] Provider生成とregistry構築を分離する
- [x] Obsidian command登録を分離する
- [x] file-menuなどのイベント登録を分離する
- [x] 外部Markdown viewのライフサイクルを分離する
- [x] 設定ロード・保存を設定ストアへ移す
- [ ] `main.ts` はPluginのライフサイクルと依存関係の組み立てに集中させる

対象: `src/main.ts`、`src/app/openExternalMarkdown.ts`、`src/settings/settingsStore.ts`

### `settings.ts`

- [x] 設定モデルとデフォルト値を分離する
- [x] `mergeSettings` と入力値の正規化を分離する
- [x] 設定画面の定義を分離する
- [ ] 設定画面からPlugin本体への依存を薄くする

対象: `src/settings/settingTab.ts`、`src/settings/mergeSettings.ts`、`src/model/settings.ts`

### 完了条件

- [ ] 各ファイルの責務を一文で説明できる
- [ ] 分割した純粋ロジックに単体テストがある
- [ ] UIイベントの挙動が変わっていない
- [ ] `vp test --run`、`pnpm check-types` が成功する

### コミット案

```text
refactor: split palette orchestration responsibilities

- extract result presentation and action routing
- isolate search history event handling
- keep modal lifecycle behavior unchanged
```

```text
refactor: separate plugin registration from lifecycle management

- extract command and event registration
- keep provider wiring and unload behavior unchanged
```

## Phase 5: Providerを機能単位に整理

最終的にはProviderの種類ではなく、検索機能単位で追える構成を目指す。

```text
src/
├── app/
├── palette/
├── search/
│   ├── PaletteProvider.ts
│   ├── file/
│   │   ├── FileProvider.ts
│   │   └── fileSorting.ts
│   ├── command/
│   │   ├── CommandProvider.ts
│   │   └── commandSorting.ts
│   ├── everything/
│   │   ├── EverythingProvider.ts
│   │   ├── EverythingHttpClient.ts
│   │   └── everythingQuery.ts
│   ├── related/
│   ├── bookmark/
│   └── smart/
├── ignored-notes/
├── settings/
├── platform/
├── ui/
├── views/
└── model/
```

### 共通化の判断基準

- [ ] 同じ変更理由で変更される処理か確認する
- [ ] 同じ入力・出力契約を持つか確認する
- [ ] 共通化後の例外処理や副作用が一つの方針になるか確認する
- [ ] 抽象化のためだけのBase classを追加しない
- [ ] `fuzzysort` の利用は、スコアリング規則が同じ場合だけ共通化する
- [ ] `BaseSuggestModal`、`SelectionModal`、`PaletteProvider` は現状の共通境界をまず維持する

### 完了条件

- [x] Providerごとの責務と外部依存がディレクトリから分かる
- [ ] 検索結果の型が意図せず機能間へ漏れていない
- [ ] Providerの共通化が実装の重複削減とテスト容易性の両方に効いている
- [ ] `vp test --run`、`pnpm check-types` が成功する

## Phase 6: 最終確認と仕様書更新

- [ ] `vp check`
- [ ] `vp test --run`
- [ ] `pnpm check-types`
- [x] `vp build`
- [ ] Obsidian上でパレットを開く
- [ ] 通常ファイル検索を確認する
- [ ] `i ` のignored note検索を確認する
- [ ] Everything検索を確認する
- [ ] command、bookmark、link、backlink、smart検索を確認する
- [ ] 履歴表示と履歴復元を確認する
- [ ] 中クリック・右クリックメニューを確認する
- [ ] ignored MarkdownのReadonly表示を確認する
- [ ] MOC Relatedsへのリンク追加を確認する
- [ ] `docs/DETAILED_SPECIFICATION.md` の構成・挙動記述を更新する
- [x] READMEの開発手順をVite+ / pnpmに合わせる

### 最終コミット案

```text
docs: update architecture and refactoring roadmap

- document the feature boundaries and validation commands
- align the detailed specification with the current implementation
- record the completed refactoring steps
```

## 各コミット共通の完了チェック

- [ ] 変更範囲が1つの責務に収まっている
- [ ] 移動と挙動変更が混ざっていない
- [ ] 必要なテストを追加・移動している
- [ ] `vp test --run` が成功する
- [ ] `pnpm check-types` が成功する
- [ ] フォーマット差分が意図したものだけである
- [ ] コミット本文に背景と維持したい挙動を箇条書きで書いている
