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

| 正式名 | 意味                                                                                     | 使わない言い方                                     | 識別子                                      |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Home   | まだどのモードにも入っていないPalette。モードの入口とファイルが並ぶ。Escで戻ってくる場所 | Root Search、Root Palette、Root mode、Initial mode | `root`(`openRootPalette`、`popToRoot…`など) |
| Mode   | Paletteの中の検索の種類。エイリアス + Spaceか、Homeから入る                              | —                                                  | `PaletteModeId`                             |

- Homeには「mode」を付けない。Modesページのモードはオン/オフできるが、Homeはオフにできないため、同列に見せない。
- 初出の説明文では「Home (the palette before a mode is entered)」のように一度定義する。ノートの「ホームノート」と取り違えないため。
- 文の中では「Back to Home」「Start at Home」のように、固有名として大文字で書く。
- 設定「Pop to Root Search」は、Homeに戻る機能を表す名前に改める(例: 「Return to Home after」)。

### Selector

| 正式名               | 意味                               | 現在の表記              | 識別子(ショートカットの範囲) |
| -------------------- | ---------------------------------- | ----------------------- | ---------------------------- |
| Tag insert selector  | 現在のノートにタグを挿入する       | Tag selector            | `tag-selector`               |
| MOC insert selector  | MOC Relatedsにリンクを挿入する     | MOC selector            | `moc-selector`(分割する)     |
| MOC remove selector  | MOC Relatedsからリンクを削除する   | MOC selector            | `moc-selector`(分割する)     |
| Folder move selector | ファイルを別のフォルダーへ移動する | Folder picker(コメント) | なし                         |

- MOC insert selectorでも、リンク済みのノートを右クリックメニューから削除できる。主な用途で名付けたものとして、この重なりは許容する。
- ショートカットの範囲`moc-selector`は、insertとremoveの2つに分ける。今MOC selectorで有効なキーを、それぞれどちらで有効にするかは分割時に決める。

### 除外

「Excluded」に統一し、どこの設定で除外されたかを頭に付けて区別する。

| 正式名                  | 意味                                                           | 使わない言い方                                  | 識別子                                            |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Obsidian-excluded files | Obsidian本体の設定「Excluded files」で隠されるファイル         | Ignored、ignored notes、excluded-folder filters | `ignored`(`includeIgnored`、`ignored-notes/`など) |
| Excluded folders        | このプラグインの設定で、すべてのファイル一覧から隠すフォルダー | —                                               | `file.excludedFolders`                            |

- このプラグインの設定画面の中では、自分の設定に「Plugin」を付けない。Obsidian側と区別が要る説明文でだけ「this plugin's Excluded folders」と書く。
- フッターのスイッチ「Ignored」と、ショートカット「Toggle Ignored」も改める(例: 「Obsidian-excluded」「Toggle Obsidian-excluded files」)。
- 識別子の`ignored`は、検索履歴に保存されるフィールド(`includeIgnored`)を含むため、改名すると保存済みデータの移行が要る。まずUIの文言だけ改め、識別子の改名は別の作業にする。

## 未決定

決めたらこの節から「決定済み」へ移す。

- **大文字・小文字**: UI全体をSentence caseに揃えるか(「Search Bookmarks」→「Search bookmarks」、「Switch Tab」→「Switch tab」)。ObsidianのガイドラインはSentence case。揃える場合、Homeは固有名として例外にする。
- **コマンド名とモード名**: コマンド名をモード名から組み立てるか(現状は「Bookmark search」と「Search Bookmarks」、「Link search」と「Search Outgoing Links」、「Open run list」と「Run Command」が食い違っている)。表示名だけを変えるなら、コマンドの`id`は変わらないため、ユーザーのホットキー割り当ては保たれる。
- **優先度を下げるフォルダー**: 「Lower prior folders」は英語として不自然。識別子`demotedPriorFolders`と意味を揃えた名前(例: 「Lower-ranked folders」)にするか。
- **ショートカットの範囲「File search」**: Paletteのうちファイルを検索する状態を指す。Palette側の用語として残すか、別の名前にするか。

## 文言を直すときの確認先

- 設定画面: `src/settings/settingPages.ts`、`src/settings/integrationSettings.ts`、`src/settings/modeSettingControl.ts`
- ショートカット表: `src/settings/shortcutsTable.ts`(`SCOPE_NAMES`、`hotkeyScopeLabel`)、`src/ui/hotkeys.ts`(`HOTKEY_ACTIONS`)
- モード名: `src/palette/modes.ts`(`PALETTE_MODES`)
- コマンド名: `src/app/registerCommands.ts`
- フッターのスイッチ: `src/palette/ignoredToggle.ts`
- 利用者向けの説明: `README.md`、`README.ja.md`
