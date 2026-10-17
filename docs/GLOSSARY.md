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

| 正式名                  | 意味                                                                   | 現在の表記                    | 識別子(ショートカットの範囲) |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
| Tag insert selector     | 現在のノートにタグを挿入する                                           | Tag selector                  | `tag-insert-selector`        |
| MOC insert selector     | MOC Relatedsにリンクを挿入する                                         | MOC selector                  | `moc-insert-selector`        |
| MOC remove selector     | MOC Relatedsからリンクを削除する                                       | MOC selector                  | `moc-remove-selector`        |
| Folder move selector    | ファイルを別のフォルダーへ移動する                                     | Folder picker(コメント)       | なし                         |
| Rename selector         | 選んだファイルの名前を `置換前/置換後` で一括変更する                  | Bulk rename(UIの名前としては) | `bulk-rename`                |
| Property value selector | 現在のノートのList型プロパティの値を付ける・外す・新しく足す           | 値のpicker                    | `property-value-selector`    |
| Bookmark group selector | ブックマークを追加・移動する先のグループを選ぶ。新しいグループも作れる | —                             | なし                         |

- MOC insert selectorでも、リンク済みのノートを右クリックメニューから削除できる。主な用途で名付けたものとして、この重なりは許容する。
- Bookmark group selectorは「Add to bookmarks…」と「Move to bookmark group…」の両方で開く。どちらも行き先のグループを選ぶ操作なので、1つの名前にする。
- ショートカットの範囲は`moc-insert-selector`と`moc-remove-selector`に分けた。Obsidian-excludedのオプションはinsertだけにある。

### 除外

「Excluded」に統一し、どこの設定で除外されたかを頭に付けて区別する。

| 正式名                  | 意味                                                           | 使わない言い方                                  | 識別子                                            |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Obsidian-excluded files | Obsidian本体の設定「Excluded files」で隠されるファイル         | Ignored、ignored notes、excluded-folder filters | `ignored`(`includeIgnored`、`ignored-notes/`など) |
| Excluded folders        | このプラグインの設定で、すべてのファイル一覧から隠すフォルダー | —                                               | `file.excludedFolders`                            |

- このプラグインの設定画面の中では、自分の設定に「Plugin」を付けない。Obsidian側と区別が要る説明文でだけ「this plugin's Excluded folders」と書く。
- オプションメニューの項目名は「Include Obsidian-excluded files」(何をするかが名前だけで分かるよう、動詞から始める)。
- 識別子の`ignored`は、検索履歴に保存されるフィールド(`includeIgnored`)を含むため、改名すると保存済みデータの移行が要る。まずUIの文言だけ改め、識別子の改名は別の作業にする。

### コマンド

コマンド名は「Open + 開くものの名前」にそろえる。`id`は名前を小文字のケバブケースにしたもの(例: 「Open outgoing link list」→ `open-outgoing-link-list`)。ObsidianのガイドラインとLintに従い、名前とidに「command」を入れない(コマンド一覧は「Open run list」)。`pnpm lint`が名前の接頭辞とidの対応を検査する(`eslint-rules/command-naming.mts`)。

| 名前                        | id                            | 開くもの                         |
| --------------------------- | ----------------------------- | -------------------------------- |
| Open home                   | `open-home`                   | Home                             |
| Open note list              | `open-note-list`              | ノートのモード                   |
| Open run list               | `open-run-list`               | Run Commandモード                |
| Open Everything list        | `open-everything-list`        | Everythingモード                 |
| Open sidebar palette        | `open-sidebar-palette`        | Sidebar palette                  |
| Open table palette          | `open-table-palette`          | Table palette                    |
| Open outgoing link list     | `open-outgoing-link-list`     | 発リンクのモード                 |
| Open backlink list          | `open-backlink-list`          | 被リンクのモード                 |
| Open bookmark list          | `open-bookmark-list`          | ブックマークのモード             |
| Open Smart Connections list | `open-smart-connections-list` | 関連ノートのモード               |
| Open tab list               | `open-tab-list`               | タブのモード                     |
| Open plugin list            | `open-plugin-list`            | Pluginsモード                    |
| Open snippet list           | `open-snippet-list`           | Snippetsモード                   |
| Open property list          | `open-property-list`          | Propertiesモード                 |
| Open vault audit list       | `open-vault-audit-list`       | Vault auditモード(Table palette) |
| Open folder move selector   | `open-folder-move-selector`   | Folder move selector             |
| Open rename selector        | `open-rename-selector`        | Rename selector                  |
| Open tag insert selector    | `open-tag-insert-selector`    | Tag insert selector              |
| Open MOC insert selector    | `open-moc-insert-selector`    | MOC insert selector              |
| Open MOC remove selector    | `open-moc-remove-selector`    | MOC remove selector              |

- idを変えると、Obsidianのホットキー設定(`hotkeys.json`)の割り当てが外れる。改名したら、保管庫の`hotkeys.json`のキーも置き換える。

### モード名

モード名は動詞を付けない名詞にし、Sentence caseで書く。Homeの「Modes」見出しの下に並ぶので、動詞は要らない。コマンド名の「Open … list」の`…`と同じ語にそろえる。

| モード名       | エイリアス | 対応するコマンド            |
| -------------- | ---------- | --------------------------- |
| Notes          | `n`        | Open note list              |
| Commands       | `>`        | Open run list               |
| Everything     | `e`        | Open Everything list        |
| Outgoing links | `o`        | Open outgoing link list     |
| Backlinks      | `b`        | Open backlink list          |
| Bookmarks      | `bk`       | Open bookmark list          |
| Related notes  | `sc`       | Open Smart Connections list |
| Tabs           | `t`        | Open tab list               |
| Plugins        | `p`        | Open plugin list            |
| Snippets       | `sn`       | Open snippet list           |
| Properties     | `pr`       | Open property list          |
| Vault audit    | `a`        | Open vault audit list       |

- コマンド名には「command」を入れられない(Obsidianのlint)ので、コマンド一覧だけは、モード名「Commands」とコマンド名「Open run list」が対応する。
- Everythingは1つのモード。Obsidian-excludedがOFFならObsidianで利用できる設定済み拡張子のファイル、ONなら保管庫フォルダー内の全ファイルを検索する。従来のVault notesとAll vault filesを統合し、`esdir`は保存済み履歴の読み取りだけで扱う。
- `sn`は`sc`と先頭が同じだが、エイリアスは`alias + Space`で照合するので共存できる。
- Vault auditは保管庫の片付けに要るものを一覧にする。列が多いので、Open vault audit listはTable paletteで開く。種類と識別子は下の「Vault audit」の節。
- Propertiesは現在のノートのプロパティを検索して編集する。Property value inputは、候補を選ぶSelectorではなく値を打つ入力欄なので、識別子`property-value-input`で範囲を分けず、ショートカットの範囲には入れない(Selectorの名前には`selector`を付けない)。

### Vault audit

計画は`docs/VAULT_AUDIT_PLAN.md`。

| 正式名         | 意味                                                 | 識別子(`AuditKind`) |
| -------------- | ---------------------------------------------------- | ------------------- |
| Orphaned files | どのノートからもリンク・埋め込みされていないファイル | `orphaned-files`    |
| Broken links   | リンク先のファイルが存在しないリンク                 | `broken-links`      |
| Empty files    | 中身のないファイル。フロントマターだけのノートも含む | `empty-files`       |
| Empty folders  | ファイルを1つも含まないフォルダー                    | `empty-folders`     |

- MOC-only notes: フロントマターと`## MOC`の節しかないノート。常にEmpty filesに含め、行に`MOC only`の印を付ける(空のノートは`Empty`)。Table paletteの列名はContent。
- 種類はオプションメニューの見出し「Show」の下から1つを選ぶ。設定`audit.kind`に保存し、すべての表示場所で共有する。
- 入力欄の案内は「Search」+ 種類名の小文字(「Search orphaned files」)。今の種類はここで示す。

### 開き方の操作名

| 操作名                  | 意味                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| Open in external editor | 設定した外部エディターでファイルまたはフォルダーを開く。最初はVS Code固定   |
| Show in system explorer | OSのファイルマネージャー(Windowsのエクスプローラー)で項目を選んだ状態で開く |
| Open in terminal        | 項目のフォルダー(ファイルなら親フォルダー)でターミナルを開く                |
| Open in search          | ObsidianのSearchで、選択したプロパティを持つノートを検索する                |

- Everythingの結果に今ある「Show in file explorer」は、Obsidianの「File explorer」(左サイドバーのファイル一覧)と紛らわしいため、「Show in system explorer」に揃える。
- 「Open in VS Code」のようにアプリ名を出すかどうかは、外部エディターの設定を決めてから合わせる。

### Homeのセクション

- HomeにはModes、Filesの順でセクションを並べる。Settingsのセクションは置かない。
- 各プラグインの設定画面へは、Pluginsモードの結果の操作メニューにある「Open plugin settings」から開く。

### ショートカット表

- ショートカットは、使える場所の組み合わせごとにまとめる。まとまりごとに見出しの行を置き、使える場所を短い名前のチップで並べる。各ショートカットは1つのまとまりにだけ出る。場所が増えてもチップが増えるだけで、列は増やさない。
- チップの短い名前は、Paletteが「Palette」、Tag insert selectorが「Tag」、MOC insert selectorが「MOC +」、MOC remove selectorが「MOC −」、Property value selectorが「Property」。見出しのツールチップとアクセシブルネームには、正式名を並べた文言(例: 「Palette, Tag insert selector, MOC insert selector」)を使う。
- PaletteとSelectorの両方で使えるものは、1つのチップに「All palettes and selectors」と書く(Folder move selectorには専用の場所がないため)。
- Paletteはファイル検索などすべてのモードを含むので、モードごとの場所は作らない。
- 絞り込みの入力欄の横に場所のドロップダウン(「All places」と各場所)を置く。場所を選ぶと、その場所で使えるショートカットだけを残し、選んだ場所のチップを強調する。「All palettes and selectors」のものはどの場所でも残る。
- まとまりはWhenの順に並べる。「All palettes and selectors」を先頭にし、あとはPalette、Tag、MOC +、MOC −、Propertyの順で比べ、同じ書き出しなら短い方を先にする。まとまりの中は、`HOTKEY_ACTIONS`の定義順。
- 並び順、チップの名前、まとめ方は`src/settings/shortcutsTable.ts`の`SCOPE_ORDER`、`SCOPE_SHORT_NAMES`、`compareScopes`、`scopeGroupKey`が決める。

### ツールチップ

- 1つの要素に出すツールチップは1つにする。Obsidianは`aria-label`をツールチップとして出すので、`aria-label`のある要素に`title`を付けない(2つ出る)。
- ホットキーを添えたいときは、`aria-label`の文言に含める(例: 「Search history (Ctrl+R)」)。名前を別に持たせたい要素は、`aria-labelledby`で名前を付け、説明は`title`だけに置く。

## 未決定

決めたらこの節から「決定済み」へ移す。

- **大文字・小文字**: モード名とコマンド名はSentence caseにした。それ以外のUI文言(設定の見出しなど)も揃えるか。ObsidianのガイドラインはSentence case。Homeは固有名として例外にする。
- **優先度を下げるフォルダー**: 「Lower prior folders」は英語として不自然。識別子`demotedPriorFolders`と意味を揃えた名前(例: 「Lower-ranked folders」)にするか。

## 文言を直すときの確認先

- 設定画面: `src/settings/settingPages.ts`、`src/settings/integrationSettings.ts`、`src/settings/modeSettingControl.ts`
- ショートカット表: `src/settings/shortcutsTable.ts`(`SCOPE_NAMES`、`hotkeyScopeLabel`)、`src/ui/hotkeys.ts`(`HOTKEY_ACTIONS`)
- モード名: `src/palette/modes.ts`(`PALETTE_MODES`)
- コマンド名: `src/app/registerCommands.ts`
- オプションメニューのスイッチ: `src/ui/panelSwitch.ts`、`src/palette/ignoredToggle.ts`
- 利用者向けの説明: `README.md`、`README.ja.md`
