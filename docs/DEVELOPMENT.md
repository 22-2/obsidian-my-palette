# 開発

My PaletteはTypeScriptで書かれ、esbuildでバンドルされます。ソースコードは`src/`以下に機能ごとに整理されています。検索、設定、Obsidianによる除外対象ファイルの処理に関する純粋ロジックの単体テストは、それぞれのソースファイルの近くに置いています。

必要な環境: Node.js、pnpm。

## コマンド

- `pnpm install`: 依存関係をインストールします。また、Gitのフック参照先を`.githooks/`に設定します。pre-commitフックは、ステージ済みファイルをoxfmtで整形します。
- `pnpm dev`: ビルドを監視モードで実行します。
- `pnpm format`: oxfmtで整形します。`pnpm format:check`は、整形されていないファイルだけを報告します。
- `pnpm lint`: ESLintとObsidianプラグイン向けルールで静的解析します。
- `pnpm test`: Vitestで単体テストを実行します。
- `pnpm test:coverage`: 単体テストを実行し、レポートを`coverage/unit/`に出力します。
- `pnpm test:coverage:e2e`: ソースマップ付きでビルドし、Playwrightのカバレッジを`coverage/e2e/`に収集してから、通常のビルドに戻します。
- `pnpm test:coverage:combined`: 2種類のカバレッジテストを実行し、結果を`coverage/combined/`にまとめます。
- `pnpm check-types`: TypeScriptの型チェックを実行します。
- `pnpm build`: 本番用バンドルを作成します。
- `pnpm e2e`: E2Eテストを実行します（詳細は下記を参照）。
- `pnpm test:e2e:smoke`: ビルドして、E2Eスモークテストだけを実行します。
- `pnpm ui:shots`: パレットと設定画面のスクリーンショットを、`UI_SHOT_DIR`の下に新しい`run-*`フォルダーを作って保存します（既定ではOSの一時フォルダー）。VS Codeのタスク「My Palette: Capture UI screenshots」から実行すると、保存先フォルダーも開きます。

整形、静的解析、型チェック、テストは個別に実行できるため、リファクタリング中も必要なものを選んで実行できます。

`esbuild.config.mjs`は`main.js`と`styles.css`を`dist/`に出力します。これらを`manifest.json`と一緒に保管庫のプラグインフォルダーへコピーし、Obsidianでプラグインを有効化または再読み込みしてください。

## アイコンと共有定数

- アイコン名は`src/ui/icons.ts`の`ICONS`に定義します。見た目ではなく意味を表す名前をキーにしています。Lucideのアイコン名を直接書かず、ここにある定義を使うことで、同じ操作には常に同じアイコンを使えます。
- 複数のメニューに表示される項目や、同じ操作を表す項目は、タイトルとアイコンとともに`src/ui/menuActions.ts`の`MENU_ACTIONS`へ一度だけ定義します。`withAction`で定義をメニュー項目に適用します。`addOpenMenuItems`と`addExternalAppMenuItems`は、「開く」と「外部アプリ」の項目を決まった順序で追加します。
- IndexedDBのデータベース名は`src/shared/databaseNames.ts`に定義します。データはユーザーのブラウザープロファイルに保存されるため、名前を変更すると既存データが失われます。

## E2Eテスト

`pnpm e2e`はプラグインをビルドして一時的な保管庫にインストールし、[obsidian-e2e-toolkit](https://github.com/22-2/obsidian-e2e-toolkit)を通じてPlaywrightで実際のObsidianを操作します。テスト仕様は`e2e/`にあります。Vitestが実行するのは`src/**/*.test.ts`だけです。

- テストは`pnpx offstage-windows playwright test`経由で実行します。Windowsでは[offstage-windows](https://github.com/LippInc/offstage-windows)がテストランナーとObsidianを非表示のデスクトップで動かし、キーボードフォーカスを奪わないようにします。それ以外のプラットフォームでは、コマンドをそのまま実行します。初回実行時に、pnpx経由でCLIがダウンロードされます。
- Windowsでは、CLIラッパーが1回の実行につき1つの非表示デスクトップを共有するため、Playwrightのワーカーを1つにします。それ以外のプラットフォームでは並列ワーカーを使います。
- プラグインの読み込みだけを手早く確認するには`pnpm test:e2e:smoke`を実行します。特定の仕様だけをビルドして実行するには`pnpm e2e file-search.spec.mts`を使います。`--shard=1/2`などの追加のPlaywright引数は`pnpm e2e`に渡せます。
- `pnpm test:e2e`は、ビルドやプラグインの準備をせずにラッパー経由でテストを実行します。E2Eカバレッジでは、計測用ビルドを準備したあとに同じラッパーを使います。
- ウィンドウを表示したり、`--debug`や`--ui`などの対話モードを使ったりする場合は、スクリプトの実行前にPowerShellで`$env:OFFSTAGE = '0'`を設定します。非表示での実行に戻すには、後で`Remove-Item Env:OFFSTAGE`を実行します。非表示デスクトップのヘルパーは`pnpx offstage-windows --check`で確認できます。
- toolkitの実行にはNode.js 23以降が必要です。
- `pnpm e2e`は最初にElectronの`install.js`を実行し、初回にElectronのバイナリをダウンロードします。通常の`pnpm install`ではダウンロードされません。
- Linuxサーバーやコンテナーなど、ディスプレイのない環境では`xvfb-run -a pnpm e2e`を実行します。
- Obsidianのビルドにはtoolkitに同梱されたものを使います。別のバージョンをテストするには、`OBSIDIAN_E2E_TOOLKIT_OBSIDIAN_VERSION`を設定してから`node node_modules/obsidian-e2e-toolkit/setup.mjs`を再実行します。
- テストに失敗すると、スクリーンショットとDOMが`test-results/`のPlaywrightレポートに添付されます。
- Everything検索では、HTTPサーバーに送信したリクエストだけを検証します。プラグインがWindows形式のパスだけを受け付けるためです。

## リリース

1. `manifest.json`のバージョンと、必要なObsidianの最小バージョンを更新します。
2. 古いObsidianでも互換性のあるリリースをダウンロードできるよう、`versions.json`に`"new-plugin-version": "minimum-obsidian-version"`の形式で項目を追加します。
3. バージョン番号と完全に一致するタグ（`v`接頭辞なし）でGitHubリリースを作成します。
4. `manifest.json`、`main.js`、`styles.css`をバイナリファイルとして添付します。`manifest.json`はリポジトリのルートにも置いておきます。
5. リリースを公開します。

`minAppVersion`を手作業で変更した後、`npm version patch|minor|major`を実行すると、`manifest.json`と`package.json`のバージョンが更新され、`versions.json`にも項目が追加されます。

## コミュニティプラグイン一覧への登録

[プラグインのレビューガイドライン](https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md)を確認し、最初のリリースを公開してから、[obsidian-releases](https://github.com/obsidianmd/obsidian-releases)にプルリクエストを作成します。

## 参考資料

- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- 設計資料: [詳細仕様書](DETAILED_SPECIFICATION.md)、[リファクタリング・ロードマップ](plan/REFACTORING_ROADMAP.md)
