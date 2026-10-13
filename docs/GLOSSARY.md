# 用語集

UIの文言(設定画面、コマンド名、ショートカット表、説明文、README)で使う用語の正本。新しい文言を書くときや既存の文言を直すときは、この表に合わせる。表にない用語が必要になったら、先にここへ足してから使う。

コード上の識別子は、保存済みデータの移行が要るものもあるため、UIの文言とは別に扱う。「識別子」列は現状を記録したもので、改名するかどうかは各項目の備考に書く。

## 決定済み(2026-10-13)

### UIの種類

| 正式名                     | 意味                                                                         | 使わない言い方             | 識別子                    |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| Palette                    | ファイルやモードを検索して開くメインのUI。表示場所の違いは修飾語で表す(下記) | Launcher(UIの名前としては) | `palette`                 |
| Selector                   | 特定の操作のために候補を選ぶUI。名前は「対象 + 操作 + selector」             | picker                     | `selector`                |
| All palettes and selectors | PaletteとSelectorの両方を指すとき(ショートカット表のWhen列など)              | All pickers、any picker    | `["palette", "selector"]` |

PaletteとSelectorの総称として新しい名詞は作らない。両方を指すときは「palettes and selectors」と書く。

### Paletteの表示場所

| 正式名          | 意味                      | 識別子(`PaletteSurface`) |
| --------------- | ------------------------- | ------------------------ |
| Palette         | モーダルで開くPalette     | `palette`                |
| Sidebar palette | 右サイドバーに開くPalette | `view`                   |
| Table palette   | 中央に表として開くPalette | `table`                  |

「sidebar」「table」を単独の名詞として使わない(「Highlight in sidebar」ではなく「Highlight in sidebar palette」)。

### Paletteの状態

| 正式名 | 意味                                                                                     | 使わない言い方                                     | 識別子                                                                   |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Home   | まだどのモードにも入っていないPalette。モードの入口とファイルが並ぶ。Escで戻ってくる場所 | Root Search、Root Palette、Root mode、Initial mode | `home`(`openHomePalette`、`returnToHome`、`home.returnAfterSeconds`など) |
| Mode   | Paletteの中の検索の種類。エイリアス + Spaceか、Homeから入る                              | —                                                  | `PaletteModeId`                                                          |

- Homeには「mode」を付けない。Modesページのモードはオン/オフできるが、Homeはオフにできないため、同列に見せない。
- 初出の説明文では「Home (the palette before a mode is entered)」のように一度定義する。ノートの「ホームノート」と取り違えないため。
- 文の中では「Back to Home」「Start at Home」のように、固有名として大文字で書く。
- 設定「Pop to Root Search」は、Homeに戻る機能を表す名前に改める(例: 「Return to Home after」)。

### Selector

| 正式名               | 意味                               | 現在の表記              | 識別子(ショートカットの範囲) |
| -------------------- | ---------------------------------- | ----------------------- | ---------------------------- |
| Tag insert selector  | 現在のノートにタグを挿入する       | Tag selector            | `tag-insert-selector`        |
| MOC insert selector  | MOC Relatedsにリンクを挿入する     | MOC selector            | `moc-insert-selector`        |
| MOC remove selector  | MOC Relatedsからリンクを削除する   | MOC selector            | `moc-remove-selector`        |
| Folder move selector | ファイルを別のフォルダーへ移動する | Folder picker(コメント) | なし                         |

- MOC insert selectorでも、リンク済みのノートを右クリックメニューから削除できる。主な用途で名付けたものとして、この重なりは許容する。
- ショートカットの範囲は`moc-insert-selector`と`moc-remove-selector`に分けた。Obsidian-excludedのスイッチはinsertだけにあるため、`toggleIgnored`はinsertだけで有効にした。

### 除外

「Excluded」に統一し、どこの設定で除外されたかを頭に付けて区別する。

| 正式名                  | 意味                                                           | 使わない言い方                                  | 識別子                                            |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Obsidian-excluded files | Obsidian本体の設定「Excluded files」で隠されるファイル         | Ignored、ignored notes、excluded-folder filters | `ignored`(`includeIgnored`、`ignored-notes/`など) |
| Excluded folders        | このプラグインの設定で、すべてのファイル一覧から隠すフォルダー | —                                               | `file.excludedFolders`                            |

- このプラグインの設定画面の中では、自分の設定に「Plugin」を付けない。Obsidian側と区別が要る説明文でだけ「this plugin's Excluded folders」と書く。
- フッターのスイッチ「Ignored」と、ショートカット「Toggle Ignored」も改める(例: 「Obsidian-excluded」「Toggle Obsidian-excluded files」)。
- 識別子の`ignored`は、検索履歴に保存されるフィールド(`includeIgnored`)を含むため、改名すると保存済みデータの移行が要る。まずUIの文言だけ改め、識別子の改名は別の作業にする。

### コマンド

コマンド名は「Open + 開くものの名前」にそろえる。`id`は名前を小文字のケバブケースにしたもの(例: 「Open outgoing link list」→ `open-outgoing-link-list`)。ObsidianのガイドラインとLintに従い、名前とidに「command」を入れない(コマンド一覧は「Open run list」)。`pnpm lint`が名前の接頭辞とidの対応を検査する(`eslint-rules/command-naming.mts`)。

| 名前                        | id                            | 開くもの                    |
| --------------------------- | ----------------------------- | --------------------------- |
| Open home                   | `open-home`                   | Home                        |
| Open note list              | `open-note-list`              | ノートのモード              |
| Open recent                 | `open-recent`                 | 最近使ったファイルのPalette |
| Open run list               | `open-run-list`               | Run Commandモード           |
| Open sidebar palette        | `open-sidebar-palette`        | Sidebar palette             |
| Open table palette          | `open-table-palette`          | Table palette               |
| Open outgoing link list     | `open-outgoing-link-list`     | 発リンクのモード            |
| Open backlink list          | `open-backlink-list`          | 被リンクのモード            |
| Open bookmark list          | `open-bookmark-list`          | ブックマークのモード        |
| Open Smart Connections list | `open-smart-connections-list` | 関連ノートのモード          |
| Open tab list               | `open-tab-list`               | タブのモード                |
| Open folder move selector   | `open-folder-move-selector`   | Folder move selector        |
| Open tag insert selector    | `open-tag-insert-selector`    | Tag insert selector         |
| Open MOC insert selector    | `open-moc-insert-selector`    | MOC insert selector         |
| Open MOC remove selector    | `open-moc-remove-selector`    | MOC remove selector         |

- idを変えると、Obsidianのホットキー設定(`hotkeys.json`)の割り当てが外れる。改名したら、保管庫の`hotkeys.json`のキーも置き換える。

### モード名

モード名は動詞を付けない名詞にし、Sentence caseで書く。Homeの「Modes」見出しの下に並ぶので、動詞は要らない。コマンド名の「Open … list」の`…`と同じ語にそろえる。

| モード名       | エイリアス | 対応するコマンド            |
| -------------- | ---------- | --------------------------- |
| Notes          | `n`        | Open note list              |
| Commands       | `>`        | Open run list               |
| Everything     | `e`        | なし                        |
| Outgoing links | `o`        | Open outgoing link list     |
| Backlinks      | `b`        | Open backlink list          |
| Bookmarks      | `bk`       | Open bookmark list          |
| Related notes  | `sc`       | Open Smart Connections list |
| Tabs           | `t`        | Open tab list               |
| Plugins        | `p`        | なし                        |
| Snippets       | `sn`       | なし                        |

- コマンド名には「command」を入れられない(Obsidianのlint)ので、コマンド一覧だけは、モード名「Commands」とコマンド名「Open run list」が対応する。
- Everythingは1つのモード。Obsidian-excludedがOFFならObsidianで利用できる設定済み拡張子のファイル、ONなら保管庫フォルダー内の全ファイルを検索する。従来のVault notesとAll vault filesを統合し、`esdir`は保存済み履歴の読み取りだけで扱う。
- `sn`は`sc`と先頭が同じだが、エイリアスは`alias + Space`で照合するので共存できる。
- Plugins・Snippetsに対応するコマンド(「Open plugin list」など)は、使ってみて要るとわかってから足す。

### 開き方の操作名

| 操作名                  | 意味                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| Open in external editor | 設定した外部エディターでファイルまたはフォルダーを開く。最初はVS Code固定   |
| Show in system explorer | OSのファイルマネージャー(Windowsのエクスプローラー)で項目を選んだ状態で開く |
| Open in terminal        | 項目のフォルダー(ファイルなら親フォルダー)でターミナルを開く                |

- Everythingの結果に今ある「Show in file explorer」は、Obsidianの「File explorer」(左サイドバーのファイル一覧)と紛らわしいため、「Show in system explorer」に揃える。
- 「Open in VS Code」のようにアプリ名を出すかどうかは、外部エディターの設定を決めてから合わせる。

### HomeのSettings

- HomeにはModes、Settings、Filesの順でセクションを並べる。
- Settingsの項目はGeneral、Modes、File search、Shortcuts、Integrationの順。Integrationは既存のIntegrations設定ページへの入口。
- Settings項目は設定ページを開く操作で、ファイルや検索履歴として扱わない。

### ショートカット表

- When列は、場所ごとの列に分けて、使える場所に●を付ける。列は「Palette、File search、Tag、MOC +、MOC −」の順。見出しの短い名前は、Tagが「Tag insert selector」、MOC +が「MOC insert selector」、MOC −が「MOC remove selector」で、ツールチップとアクセシブルネームには正式名を使う。
- PaletteとSelectorの両方で使えるものは、列をまたぐ1つのセルに「All palettes and selectors」と書く(Folder move selectorには専用の列がないため)。
- 行はWhenの順に並べる。「All palettes and selectors」を先頭にし、あとは上の列の順で比べ、同じ書き出しなら短い方を先にする。同じWhenの行は、`HOTKEY_ACTIONS`の定義順。
- 並び順と列は`src/settings/shortcutsTable.ts`の`SCOPE_ORDER`、`MATRIX_COLUMNS`、`compareScopes`が決める。

### ツールチップ

- 1つの要素に出すツールチップは1つにする。Obsidianは`aria-label`をツールチップとして出すので、`aria-label`のある要素に`title`を付けない(2つ出る)。
- ホットキーを添えたいときは、`aria-label`の文言に含める(例: 「Search history (Ctrl+R)」)。名前を別に持たせたい要素は、`aria-labelledby`で名前を付け、説明は`title`だけに置く。

## 未決定

決めたらこの節から「決定済み」へ移す。

- **大文字・小文字**: モード名とコマンド名はSentence caseにした。それ以外のUI文言(設定の見出しなど)も揃えるか。ObsidianのガイドラインはSentence case。Homeは固有名として例外にする。
- **優先度を下げるフォルダー**: 「Lower prior folders」は英語として不自然。識別子`demotedPriorFolders`と意味を揃えた名前(例: 「Lower-ranked folders」)にするか。
- **ショートカットの範囲「File search」**: Paletteのうちファイルを検索する状態を指す。Palette側の用語として残すか、別の名前にするか。

## 文言を直すときの確認先

- 設定画面: `src/settings/settingPages.ts`、`src/settings/integrationSettings.ts`、`src/settings/modeSettingControl.ts`
- ショートカット表: `src/settings/shortcutsTable.ts`(`SCOPE_NAMES`、`hotkeyScopeLabel`)、`src/ui/hotkeys.ts`(`HOTKEY_ACTIONS`)
- モード名: `src/palette/modes.ts`(`PALETTE_MODES`)
- コマンド名: `src/app/registerCommands.ts`
- フッターのスイッチ: `src/palette/ignoredToggle.ts`
- 利用者向けの説明: `README.md`、`README.ja.md`
