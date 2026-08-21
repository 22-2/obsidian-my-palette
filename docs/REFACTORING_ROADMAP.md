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
- [ ] `vp check` を成功させる
  - 現在は25ファイルの既存フォーマット差分で失敗している
- [x] 整理開始前のGitワークツリーがcleanである

## Phase 0: 基準値とフォーマットの固定

### 作業

- [ ] `vp check --fix` を実行する
- [ ] フォーマット変更だけを確認する
- [ ] 実行結果を確認する
  - [ ] `vp check`
  - [ ] `vp test --run`
  - [ ] `pnpm check-types`

### 完了条件

- [ ] フォーマット変更に機能変更が混ざっていない
- [ ] `vp check`、`vp test --run`、`pnpm check-types` が成功する
- [ ] 後続作業はフォーマット差分を含まない

### コミット案

```text
chore: format existing sources

- apply the repository formatter
- keep runtime behavior unchanged
```

## Phase 1: 未使用コードと古い仕様記述の整理

### 作業

- [ ] `src/core/strings.ts` の参照元を確認し、未使用なら削除する
- [ ] `src/ui/ResultList.ts` の参照元を確認し、未使用なら削除する
- [ ] `src/ui/statusMessage.ts` の参照元を確認し、未使用なら削除する
- [ ] `docs/DETAILED_SPECIFICATION.md` の古い構成図を現状に合わせる
- [ ] 削除後にビルドエントリから参照されていないことを確認する

### 完了条件

- [ ] 未使用ファイルが削除されている
- [ ] 仕様書に存在しないファイルや古い構成が残っていない
- [ ] `vp test --run` が成功する
- [ ] `pnpm check-types` が成功する

### コミット案

```text
chore: remove unused modules

- remove modules with no runtime imports
- update the architecture specification to match the source tree
```

## Phase 2: 高リスク領域の振る舞いをテストで固定

テスト対象を増やしてから、ディレクトリ移動と責務分割を始める。

### 設定

- [ ] `mergeSettings` のデフォルト補完をテストする
- [ ] 不正な型・範囲外の数値をデフォルトへ戻すことをテストする
- [ ] prefix変更後の履歴分類をテストする
- [ ] 古い履歴データの読み込みとカテゴリ補完をテストする
- [ ] `schemaVersion` と保存判断をテストする

対象: `src/settings.ts`、`src/model/settings.ts`

### ignored note

- [ ] 通常の除外フォルダ判定をテストする
- [ ] 正規表現形式の除外フィルターをテストする
- [ ] 壊れた正規表現を安全に扱うことをテストする
- [ ] 存在しない除外フォルダをスキップすることをテストする
- [ ] キャッシュ済みエントリの再利用条件をテストする
- [ ] 同じノートを二重importしないことをテストする
- [ ] 同名ファイルの衝突時に決定的なsuffixを付けることをテストする
- [ ] frontmatterを既存・新規の両方で正しく追加することをテストする
- [ ] dot-folder由来のパスをlink可能な表示先へ変換することをテストする

対象: `src/core/ignoredPaths.ts`、`src/core/ignoredNoteIndex.ts`、`src/core/ignoredNoteMaterializer.ts`

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

- [ ] `src/core/ignoredPaths.ts` → `src/ignored-notes/ignoredPaths.ts`
- [ ] `src/core/ignoredNoteIndex.ts` → `src/ignored-notes/IgnoredNoteIndex.ts`
- [ ] `src/core/ignoredNoteMaterializer.ts` → `src/ignored-notes/materializeIgnoredNote.ts`
- [ ] `src/core/desktopAdapter.ts` → `src/platform/desktopAdapter.ts`
- [ ] `src/core/vscode.ts` → `src/platform/vscode.ts`
- [ ] `src/core/pathClipboard.ts` → `src/platform/pathClipboard.ts`
- [ ] `src/core/pathDisplay.ts` → `src/platform/pathDisplay.ts` または `src/shared/pathDisplay.ts`
- [ ] `src/core/externalFiles.ts` → `src/platform/externalFiles.ts` または `src/shared/externalFiles.ts`
- [ ] `src/core/searchHistory.ts` → `src/palette/searchHistory.ts`

### ルール

- [ ] 移動コミットではロジックを変更しない
- [ ] テストファイルも実装と同じディレクトリへ移動する
- [ ] import pathの変更だけで済ませる
- [ ] 移動後に `rg` で古いimport pathが残っていないことを確認する

### 完了条件

- [ ] `src/core` が空、または明確な共通処理だけになっている
- [ ] ignored noteの処理が一つの機能領域として追える
- [ ] Obsidian/Electron依存の処理が `platform` に集約されている
- [ ] `vp test --run` と `pnpm check-types` が成功する

### コミット案

```text
refactor: separate core modules by responsibility

- move ignored note logic into its feature boundary
- move desktop and path integrations into platform modules
- keep runtime behavior unchanged
```

## Phase 4: 大きなファイルを責務ごとに分割

### `PaletteModal.ts`

- [ ] 結果を`SelectionItem`へ変換する処理を分離する
- [ ] 結果ごとの表示バッジ判定を分離する
- [ ] 結果アクションの振り分けを分離する
- [ ] 検索履歴のイベント登録と遅延保存を分離する
- [ ] バックグラウンドオープン処理を分離する
- [ ] `PaletteModal` は入力・選択状態・検索世代管理に集中させる

対象: `src/palette/PaletteModal.ts`

### `main.ts`

- [ ] Provider生成とregistry構築を分離する
- [ ] Obsidian command登録を分離する
- [ ] file-menuなどのイベント登録を分離する
- [ ] 外部Markdown viewのライフサイクルを分離する
- [ ] 設定ロード・保存を設定ストアへ移す
- [ ] `main.ts` はPluginのライフサイクルと依存関係の組み立てに集中させる

対象: `src/main.ts`

### `settings.ts`

- [ ] 設定モデルとデフォルト値を分離する
- [ ] `mergeSettings` と入力値の正規化を分離する
- [ ] 設定画面の定義を分離する
- [ ] 設定画面からPlugin本体への依存を薄くする

対象: `src/settings.ts`、`src/model/settings.ts`

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

- [ ] Providerごとの責務と外部依存がディレクトリから分かる
- [ ] 検索結果の型が意図せず機能間へ漏れていない
- [ ] Providerの共通化が実装の重複削減とテスト容易性の両方に効いている
- [ ] `vp test --run`、`pnpm check-types` が成功する

## Phase 6: 最終確認と仕様書更新

- [ ] `vp check`
- [ ] `vp test --run`
- [ ] `pnpm check-types`
- [ ] 必要に応じて `vp build`
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
- [ ] READMEの開発手順をVite+ / pnpmに合わせる

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
