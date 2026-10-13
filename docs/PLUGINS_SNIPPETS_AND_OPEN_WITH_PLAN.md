# Plugins・Snippetsモードと外部アプリで開く操作の計画

My Commandsの`quickOpen`(`obsidian-my-commands/src/commands/categories/open-operations.ts`)でよく使う「場所を選ぶ → 開き方を選ぶ」の操作を、Paletteの作りに合わせて移す。

## 方針

`quickOpen`の2段階を、Paletteでは別々の仕組みにする。

| `quickOpen`の段階                                 | Paletteでの置き場所 | 理由                                                                                                                                                                 |
| ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 開く場所(プラグイン、スニペット)                  | モード              | 候補が多く、検索して選ぶ価値がある                                                                                                                                   |
| 開く場所(現在のノート、保管庫ルート、`.obsidian`) | 移さない(下記)      | 候補が1つしかなく、検索するものがない                                                                                                                                |
| 開き方(エディター、エクスプローラー、ターミナル)  | 結果の操作          | モードにするとほかの結果で使えない。操作にすればどのモードのファイル結果にも効く                                                                                     |
| GitHubのページ(Issues、Discussionsなど)           | 移さない            | `gh`と保管庫のGitHubリポジトリが前提で、「検索して開く」ではなく「決まった外部コマンドを実行する」操作になる。`docs/IDEAS_GITHUB_INTEGRATION.md`にアイデアとして残す |

移さないものは、My Commandsの個別のコマンドとして残し、Commandsモード(`>`)から呼ぶ。My Commands側の整理は`obsidian-my-commands/docs/QUICK_OPEN_COMMANDS_PLAN.md`で行う。

現在のノートを外部アプリで開く操作は、Notes・Tabsなどの結果に付く「開き方」の操作で代わりになる。

## 用語(実装の最初にGLOSSARYへ足す)

### モード名

| モード名 | エイリアス | 対応するコマンド | 識別子(`PaletteModeId`) |
| -------- | ---------- | ---------------- | ----------------------- |
| Plugins  | `p`        | なし             | `plugins`               |
| Snippets | `sn`       | なし             | `snippets`              |

- 既存のエイリアス(`n`、`>`、`e`、`o`、`b`、`bk`、`sc`、`t`)とは重ならない。`sn`は`sc`と先頭が同じだが、エイリアスは`alias + Space`で照合するので共存できる。
- 対応するコマンド(「Open plugin list」など)は、使ってみて要るとわかってから足す。

### 開き方の操作名

| 操作名                  | 意味                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| Open in external editor | 設定した外部エディターでファイルまたはフォルダーを開く                      |
| Show in system explorer | OSのファイルマネージャー(Windowsのエクスプローラー)で項目を選んだ状態で開く |
| Open in terminal        | 項目のフォルダー(ファイルなら親フォルダー)でターミナルを開く                |

- 決めておくこと: Everythingの結果に今ある「Show in file explorer」は、Obsidianの「File explorer」(左サイドバーのファイル一覧)と紛らわしい。「Show in system explorer」に揃えるかを、GLOSSARYの未決定に入れて決める。
- 「Open in VS Code」のようにアプリ名を出すかどうかは、外部エディターの設定(下記)を決めてから合わせる。

## 1. 開き方の操作

### 対象

`absolutePath`を持つ結果すべてに付ける。

- Notes、Everything、Outgoing links(解決済みのもの)、Backlinks、Bookmarks(ファイル・フォルダー)、Related notes、Tabs(ファイルを開いているもの)
- 新しいPlugins・Snippetsの結果

Home のモードの入口とSettingsの入口、Commandsの結果には付けない。

### 置き場所

- 結果の操作メニュー(右クリック、`Show result actions`のホットキー)の、`Open …`の並びとパスのコピーのあいだに区切り線を入れて並べる。
- 組み立ては`src/palette/actions/resultContextMenu.ts`。Everything限定の「Show in file explorer」は、この共通の操作にまとめる。
- 個別のホットキーは最初は付けない。使う頻度がわかってから`HOTKEY_ACTIONS`に足す。

### 実装

外部アプリを起動する処理は`src/platform/`に集める。

| 操作                    | 実装の見込み                                                  | 既存のもの                                                            |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Open in external editor | 最初はVS Codeだけ。`vscode://file/…`を開く                    | `src/platform/vscode.ts`の`openPathInCode`(現在は呼び出し元がない)    |
| Show in system explorer | Electronの`shell.showItemInFolder`                            | Everythingの`alternate`の動き(`executePaletteResult.ts`)              |
| Open in terminal        | `child_process`で起動する。Windowsは`wt -d <dir>`を既定にする | なし。My Commandsの`openInTerminal`、`getTerminalCommand`を参考にする |

- フォルダーを開けるかどうかはエディターごとに違う(My Commandsの`supportsWorkspaceFolders`)。最初はVS Codeだけなので考えなくてよいが、エディターを増やすときに、開けない組み合わせを操作メニューに出さない判定を足す。
- `Open in terminal`は起動するコマンドをOSごとに変える必要があり、ほかの2つより重い。2つを先に出し、ターミナルは後の段階に回してもよい。
- すべてデスクトップ専用。モバイルでは操作メニューに出さない(`Platform.isDesktopApp`)。

### 決めること

- 外部エディターを設定にするか。最初はVS Code固定で始め、設定はGeneralに「External editor」を足すときに決める。
- `Open in terminal`のコマンドを設定にするか(yaziなどで開きたい場合)。最初は既定のシェルだけにする。

## 2. Pluginsモード

### 候補

- インストール済みのコミュニティプラグインすべて(`app.plugins.manifests`)。無効のものも含める。
- 1行の表示: タイトルはプラグイン名(`manifest.name`)、補足は`manifest.id`とバージョン。無効のものは無効とわかる印を付ける。
- 開く対象はプラグインのフォルダー(`manifest.dir`を保管庫ルートから絶対パスにしたもの)。
- 空入力では名前順。入力時はほかのモードと同じあいまい検索で、名前とidを対象にする。

### 操作

| 操作                    | 動き                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Enter                   | フォルダーを外部エディターで開く                                                                    |
| Show in system explorer | フォルダーを開く                                                                                    |
| Open in terminal        | フォルダーでターミナルを開く                                                                        |
| Open plugin settings    | そのプラグインの設定タブを開く(`app.setting.openTabById(id)`)。設定タブのないプラグインでは出さない |
| パスのコピー            | 既存の`addCopyPathMenuItems`を使う                                                                  |

- プラグインの有効・無効の切り替えやリロードは、今回は入れない(My Commandsの`reload-chosen-plugin`などに残す)。

## 3. Snippetsモード

### 候補

- 先頭に「snippetsフォルダー」の行(`.obsidian/snippets`そのもの)。
- 続けて各スニペット(`app.customCss.snippets`)。タイトルはファイル名(`.css`なし)、補足は有効・無効(`app.customCss.enabledSnippets`)。
- 空入力ではフォルダーの行、その後に名前順。入力時はスニペットだけをあいまい検索する。

### 操作

| 操作                    | 動き                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| Enter                   | スニペットのファイル(フォルダーの行ならフォルダー)を外部エディターで開く |
| Show in system explorer | ファイルを選んだ状態でフォルダーを開く                                   |
| Open in terminal        | snippetsフォルダーでターミナルを開く                                     |
| パスのコピー            | 既存の`addCopyPathMenuItems`を使う                                       |

- スニペットの有効・無効の切り替えと新規作成は、今回は入れない。新規作成はMy Commandsの`create-new-snippet-in-external-editor`に残す。
- snippetsフォルダーがまだないとき(スニペットを1つも作っていない保管庫)は、フォルダーの行だけを出し、開く前にフォルダーを作るかどうかを実装時に決める。

## 4. モードとして組み込むときに触る場所

- `src/palette/modes.ts`: `PaletteModeId`と`PALETTE_MODES`に足す。Homeでの並び順は、Tabsのあと(よく使うモードの後ろ)にする。
- `src/palette/results.ts`: 結果の型(`mode: "plugin"`、`mode: "snippet"`)を足し、`absolutePath`を持たせる。
- `src/palette/executePaletteResult.ts`: Enterで外部エディターを開く分岐を足す。
- `src/settings/model.ts`: `modes`の既定値に`plugins`(`p`)と`snippets`(`sn`)を足す。保存済みの設定に新しいモードがない場合に既定値で補う処理があるかを確かめ、なければ足す。
- 使える条件: デスクトップでだけ使えるモードにする。今の`isModeIntegrationReady`は連携機能の準備を見る仕組みなので、デスクトップ専用の判定をそこへ入れるか、別の判定を足すかを実装時に決める。
- 設定のModesページ: モードを足せば、エイリアスと有効・無効の行が自動で並ぶ見込み(`src/settings/modeSettingControl.ts`)。

## 進め方

1. GLOSSARYに、モード名・エイリアスと開き方の操作名を足す。「Show in file explorer」の扱いを決める。
2. 開き方の操作(Open in external editor、Show in system explorer)をファイル結果に付ける。Everythingの「Show in file explorer」をまとめる。
3. Pluginsモードを足す。
4. Snippetsモードを足す。
5. Open in terminalを足す(後回しにしてもよい)。
6. README、README.jaに、モードと操作を書く。

各段階で、結果を組み立てる関数の単体テスト(Vitest)を足す。Homeにモードが並ぶこと、エイリアスで入れること、操作メニューに項目が出ることは、E2Eで確かめる。外部アプリが実際に起動するかは、E2Eでは起動処理を差し替えて呼び出しだけを確かめる。
