# Vault auditモードの計画

保管庫の片付けに要るファイルを、Paletteの1つのモードで一覧にする。孤立ファイル・壊れたリンク・空ファイル・空フォルダーの4種類を、オプションメニューで切り替えて表示し、選んだものをまとめてゴミ箱かアーカイブへ移す。

元にした機能は[Find orphaned files and broken links](https://github.com/Vinzent03/find-unlinked-files)。フォークはせず、判定の考え方だけを取り込んで作り直す。元のプラグインには次の困りごとがあるため。

- 結果を保管庫のルートにMarkdownで書き出す。出力ファイル自体が孤立ファイルへリンクするので、書き出した時点で孤立ファイルでなくなる(回避のために「Disable working links」という設定がある)。
- 結果がリンクを並べただけで、サイズ・更新日・参照元がわからない。壊れたリンクは、どのノートのどこにあるかがわからない。
- 削除・アーカイブは出力ファイルのリンクを読み直して行うので、一覧を見ながら一部だけを選ぶことができない。

Paletteには、TanStack Tableを使ったTable palette、ファイルマネージャーと同じ操作の複数選択、右クリックの操作がすでにある。表示と一括操作はそれを使う。

## 決めたこと

| 項目             | 内容                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| 置き場所         | Paletteのモード。判定・表示・CLIをすべてMy Paletteに置く                                            |
| モードの数       | 1つ。4種類をそれぞれモードにするとHomeに並びすぎるため                                              |
| 種類の切り替え   | オプションメニュー(`Ctrl+O`、`…`ボタン)で1つを選ぶ。今の種類はフッターに出す                        |
| 表示             | Palette・Sidebar palette・Table paletteのどれでも使える。列が多いので主にTable paletteで使う想定    |
| 結果の書き出し   | しない。ファイルを作らないので、一覧が判定に影響しない                                              |
| 一括操作         | 「Move to trash」と「Move to archive folder」。複数選択に対して右クリックで行う                     |
| ゴミ箱           | `fileManager.trashFile`を使い、Obsidianの設定「Deleted files」に従う                                |
| AIからの呼び出し | Obsidian CLI(`obsidian my-palette:audit`)。JSONを返す。ゴミ箱・アーカイブは指定したときだけ実行する |
| 範囲外           | 壊れたリンクの先のノートを作る機能、ほかのプラグインからモードを登録するAPI(別の計画にする。下記)   |

## 用語(実装の最初にGLOSSARYへ足す)

| 正式名         | 種類       | 意味                                                           | 識別子                                           |
| -------------- | ---------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Vault audit    | モード名   | 保管庫の片付けに要るファイルを一覧にするモード                 | `PaletteModeId`は`audit`、`PaletteMode`は`audit` |
| Audit kind     | 設定の名前 | Vault auditで表示する種類(下の4つ)。UIでは見出し「Show」で出す | `AuditKind`                                      |
| Orphaned files | 種類       | どのノートからもリンク・埋め込みされていないファイル           | `orphaned-files`                                 |
| Broken links   | 種類       | リンク先のファイルが存在しないリンク                           | `broken-links`                                   |
| Empty files    | 種類       | 中身のないファイル。フロントマターだけのノートも含む           | `empty-files`                                    |
| Empty folders  | 種類       | ファイルを1つも含まないフォルダー                              | `empty-folders`                                  |
| Archive folder | 設定の名前 | 「Move to archive folder」の移動先                             | `audit.archiveFolder`                            |

- モード名は「Cleanup」も候補にした。種類の中に「削除しないほうがよいもの」(壊れたリンク)を含むので、片付けを前提にしない「audit」にした。
- エイリアスは`a`(空いている)。既存のユーザーが`a`を使っていたら、Pluginsのときと同じく`unusedAlias`で空いているものに移す。
- コマンド「Open vault audit list」は、Table paletteをこのモードで開くものとして最初から足す(Homeを経由せずに開きたいことが多いため)。

## 判定

判定は保管庫の状態を受け取って結果を返す純粋な関数にまとめ、`src/audit/vaultAudit.ts`に置く。Obsidianには依存させず、単体テストで判定を押さえる。モードとCLIは同じ関数を呼ぶ。

```text
src/audit/vaultAudit.ts   判定(純粋な関数)
  ├─ src/search/audit/AuditProvider.ts   Paletteのモード
  └─ src/audit/auditCli.ts               Obsidian CLI
```

判定の関数に渡すもの:

| 入力               | 取り出し元                                           |
| ------------------ | ---------------------------------------------------- |
| ファイル一覧       | `vault.getFiles()`(パス、拡張子、サイズ、更新日)     |
| フォルダー         | `vault.getAllFolders()`                              |
| 解決済みリンク     | `metadataCache.resolvedLinks`                        |
| 未解決リンク       | `metadataCache.unresolvedLinks`                      |
| ノートの中身の有無 | `metadataCache.getFileCache(file)`の`sections`(下記) |
| タグ               | `getAllTags(cache)`                                  |
| 除外の条件         | 設定(下記)                                           |

### 除外

すべての種類に共通で、次に当たるものは結果に出さない。

- Obsidian-excluded files(既存の`includeIgnored`のオプションには対応させない。片付けの対象にするべきでないため)
- このプラグインのExcluded folders
- Vault audit専用の設定(下記の「設定」)で除外したフォルダー・タグ・拡張子

### Orphaned files

- `resolvedLinks`の値に一度も出てこないファイル。リンクと埋め込みの両方を数える(`resolvedLinks`は両方を含む)。
- 自分自身へのリンクだけを持つファイルは孤立として扱う。
- 既定で除外する: Daily notesのフォルダー、Templatesのフォルダー(コアプラグインの設定から読む。無効なら除外しない)。どちらもリンクされないのが普通のため。設定で外せるようにする。
- Canvasからのリンクが`resolvedLinks`に入るかは要確認。入らない場合は、`.canvas`をJSONとして読み、`file`ノードと`text`ノード内のリンクを数える。

### Broken links

- 1行を「存在しないリンク先」1つにする(参照元ごとに分けない)。同じ名前へのリンクが10個のノートにあっても1行で、Linked fromの列に件数を出す。
- 参照元とその行は`getFileCache(source).links`と`embeds`から、`link`が一致するものを探す。`unresolvedLinks`は件数しか持たないため。
- 見出し・ブロックへのリンク(`[[note#heading]]`)で、ノートはあるが見出しが無いものは、今回は扱わない。

### Empty files

- Markdown: `getFileCache(file).sections`が無いか、`yaml`の節しか無いもの。中身を読まずに判定できる。
- Markdown以外: サイズが0のもの。
- 判定の直後に書き込みがあると、キャッシュが古いことがある。ゴミ箱・アーカイブの直前に、Markdownは`vault.cachedRead`で読み直して空であることを確かめ、空でなければ飛ばす。

### Empty folders

- 子孫にファイルを1つも含まないフォルダー。空のフォルダーだけを含むフォルダーも空とする。
- 一覧には、空のフォルダーのうち一番上のものだけを出す(それをゴミ箱へ移せば中も消えるため)。
- `.`で始まるファイルは`vault`から見えないので、それだけを含むフォルダーも空と判定される。元のプラグインと同じ扱いだが、ゴミ箱へ移すとそのファイルも消えるので、確認の文に書く(下記)。

## 表示

### 種類の切り替え

オプションメニューに、1つだけを選ぶ項目の組を足す。今のオプションメニューはオン/オフのスイッチ(`PanelSwitch`)しか置けないので、1つを選ぶ部品`PanelChoice`を足す。

```text
Show
  ✓ Orphaned files
    Broken links
    Empty files
    Empty folders
─────────
Options
    Highlight search matches
```

- `PanelChoice`は`PanelSwitch`と同じく、状態だけを持つ。メニューでは`PaletteMenu`の`setChecked`で今の値を示し、`setKeepOpen`は付けない(選んだら一覧が変わるので閉じる)。
- Vault auditモードの間だけ出す(`setHidden`。`syncIgnoredToggle`と同じ作り)。
- 選んだ種類は設定`audit.kind`に保存し、次に開いたときも同じ種類にする。Table paletteとPaletteで分けない。
- フッターの左に「Orphaned files」のように今の種類を出す。クリックするとオプションメニューを開く。
- 入力欄の案内も種類に合わせる(「Search orphaned files」など)。

### 列

今のTable paletteの列(Name・Path・Modified・prior)は全モード共通で固定されている。Vault auditでは種類ごとに要る列が違うので、**モードごとに列の組を持てるようにする**。ほかのプラグインからモードを登録するAPIを作るときにも同じ仕組みが要る。

| 種類           | 列                                                                          | 既定の並び        |
| -------------- | --------------------------------------------------------------------------- | ----------------- |
| Orphaned files | Name、Path、Size、Modified                                                  | Pathの昇順        |
| Broken links   | Link(リンク先の文字列)、Linked from(件数)、First source(最初の参照元のパス) | Linked fromの降順 |
| Empty files    | Name、Path、Modified                                                        | Pathの昇順        |
| Empty folders  | Path、Folders inside(中にある空のフォルダーの数)                            | Pathの昇順        |

- 列の定義(`PALETTE_TABLE_COLUMNS`と`columns`)を、列の組のIDごとに持つ形にする。今の4列は`files`の組とし、Vault audit以外のモードはこれまでどおりそれを使う。
- 列の並び・非表示・並べ替えの状態は、列の組ごとに保存する。保存済みのワークスペースの状態は`files`の組として読む(`normalizePaletteTableState`で移行する)。
- Sidebar paletteとPaletteでは、今と同じく1行目・2行目の表示にする。1行目は名前、2行目はパスとSize(Broken linksでは「3 notes」のような件数)。

### 入力

入力は結果の絞り込みに使う。Notesと同じあいまい検索を、Path(Broken linksではLink)にかける。並びは、入力があるときはスコア順、無いときは上の既定の並び。

### 一覧を作り直すとき

- モードに入ったとき、種類を変えたときに判定する。
- 表示中は、`metadataCache`の`resolved`と、`vault`の`create`・`delete`・`rename`で作り直す。間を空けて1回にまとめる(既存の`fileListRefresh.ts`を使う)。
- ゴミ箱・アーカイブのあとは、作り直しを待たずに、移した行を先に消す。

## 操作

### Enter

| 種類           | Enter                                                 |
| -------------- | ----------------------------------------------------- |
| Orphaned files | ファイルを開く(Notesと同じ。開く場所の修飾キーも同じ) |
| Broken links   | 最初の参照元を開き、そのリンクの行へ移る              |
| Empty files    | ファイルを開く                                        |
| Empty folders  | ファイルエクスプローラーでフォルダーを表示する        |

### 右クリック

| 操作                    | 対象                                                             | 複数選択 |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| Open                    | Broken links以外                                                 | —        |
| Open linked notes…      | Broken links。参照元を選ぶ一覧を出し、選んだノートのその行へ移る | —        |
| Reveal in file explorer | すべて                                                           | —        |
| Copy path               | すべて(既存の`addCopyPathMenuItems`)                             | ○        |
| Move to trash           | Broken links以外                                                 | ○        |
| Move to archive folder  | Orphaned files、Empty files                                      | ○        |

- 複数選択では、既存の`addSelectionHeader`で件数を先頭に出す。
- 「Move to trash」「Move to archive folder」は、実行前に確認を出す。件数と、最初の数件のパスを並べる。Empty foldersでは「Hidden files inside these folders are also removed.」を足す。
- アーカイブは、元のパスを保ってArchive folderの下へ移す(`notes/a.md`→`<Archive folder>/notes/a.md`)。途中のフォルダーが無ければ作る。同じパスにファイルがあれば、そのファイルは飛ばして通知に数を出す。移動は`fileManager.renameFile`で行い、ほかのノートからのリンクも更新させる(孤立ファイルには無いが、Empty filesにはありうる)。
- Archive folderが未設定なら、「Move to archive folder」は無効にして、説明に「Set an archive folder in the settings.」と出す。
- 失敗は1件ずつ数え、最後に1回だけ通知する(「Moved 12 files to trash. 1 failed; see the console.」)。

## CLI

My PaletteにはまだCLIが無いので、`registerCliHandler`で足す(`minAppVersion`は1.13.0で、使える)。My Commandsの`src/cli/registry.ts`と同じ作りにする。

| コマンド           | 内容                        |
| ------------------ | --------------------------- |
| `my-palette`       | 使えるCLIの一覧をJSONで返す |
| `my-palette:audit` | 判定してJSONで返す          |

`my-palette:audit`のフラグ:

| フラグ           | 内容                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `kind=<kind>`    | 必須。`orphaned-files`・`broken-links`・`empty-files`・`empty-folders` |
| `glob=<pattern>` | 結果を保管庫内のパスで絞る(My Commandsの`TARGET_FLAGS`と同じ書き方)    |
| `trash`          | 絞った結果をゴミ箱へ移す。`broken-links`では使えない                   |
| `archive`        | 絞った結果をArchive folderへ移す。`orphaned-files`・`empty-files`だけ  |

- 既定は判定だけで、何も変えない。`trash`と`archive`は同時に指定できない。
- AIが誤って広い範囲を消さないよう、`trash`・`archive`は`glob`の指定を必須にする。
- 返すJSON:

```json
{
	"kind": "broken-links",
	"count": 2,
	"items": [
		{
			"link": "Missing note",
			"sources": [{ "path": "notes/a.md", "line": 12 }]
		}
	]
}
```

- `trash`・`archive`を指定したときは、`items`の各要素に`"result": "trashed" | "archived" | "skipped" | "failed"`と理由を足す。
- 例外はMy Commandsと同じく`{ "error": "…" }`で返す。
- CLIの使い方を説明するスキルは、使い始めてから要るか決める。

## 設定

設定画面に「Vault audit」の見出しを足す。

| 設定                              | 既定 | 内容                                                     |
| --------------------------------- | ---- | -------------------------------------------------------- |
| Archive folder                    | 空   | 「Move to archive folder」の移動先                       |
| Excluded folders for audit        | 空   | Vault auditだけで除外するフォルダー                      |
| Excluded tags for audit           | 空   | このタグを持つノートを除外する                           |
| Excluded extensions for audit     | 空   | この拡張子のファイルを除外する                           |
| Exclude daily notes and templates | オン | Daily notesとTemplatesのフォルダーを孤立ファイルから除く |

- `audit.kind`は設定画面には出さない(オプションメニューで変えるため)。
- 設定の版(`SETTINGS_SCHEMA_VERSION`)を上げ、`mergeSettings`に既定値を足す。
- 元のプラグインにある「特定のファイルにリンクしているファイルを除外する」は、使う場面がわかるまで入れない。

## 触る場所

| ファイル                                                                                                       | 変更                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `docs/GLOSSARY.md`                                                                                             | 用語を足す                                    |
| `src/audit/vaultAudit.ts`(新規)                                                                                | 判定                                          |
| `src/audit/auditActions.ts`(新規)                                                                              | ゴミ箱・アーカイブ。モードとCLIで共有する     |
| `src/audit/auditCli.ts`(新規)、`src/app/registerCli.ts`(新規)                                                  | CLI                                           |
| `src/search/audit/AuditProvider.ts`(新規)                                                                      | 判定の結果を`AuditResult`にし、入力で絞る     |
| `src/palette/results.ts`                                                                                       | `PaletteMode`に`audit`、`AuditResult`を足す   |
| `src/palette/modes.ts`                                                                                         | `PALETTE_MODES`に足す                         |
| `src/settings/model.ts`、`src/settings/mergeSettings.ts`                                                       | モードの設定、`audit`の設定、エイリアスの移行 |
| `src/app/createPaletteProviders.ts`                                                                            | `AuditProvider`をつなぐ                       |
| `src/palette/PaletteSearchSession.ts`                                                                          | 入力欄の案内                                  |
| `src/palette/searchHistory.ts`                                                                                 | 検索履歴の分類に`audit`を足す                 |
| `src/palette/resultPresentation.ts`                                                                            | 1行目・2行目とアイコン                        |
| `src/palette/executePaletteResult.ts`                                                                          | Enter                                         |
| `src/palette/actions/auditMenu.ts`(新規)、`src/palette/actions/resultContextMenu.ts`                           | 右クリック                                    |
| `src/ui/panelChoice.ts`(新規)、`src/ui/suggestionPanel.ts`、`src/palette/components/PaletteHistoryControls.ts` | 1つを選ぶ項目                                 |
| `src/palette/table/paletteTableModel.ts`、`src/palette/table/PaletteTableControls.ts`                          | 列の組                                        |
| `src/app/registerCommands.ts`                                                                                  | Open vault audit list                         |
| `README.md`、`README.ja.md`                                                                                    | モードとCLIの説明                             |

`mocInsertion.ts`・`tagInsertionMenu.ts`など、`result.mode`で対象外のモードを並べている箇所にも`audit`を足す(MOCやタグの操作を出さないため)。型の検査で漏れがわかるよう、可能なところは`switch`の網羅で書く。

## 進め方

1段目だけでも使えるように、表示の部品より先に判定とCLIを作る。

1. **判定とCLI**: `vaultAudit.ts`と単体テスト、`my-palette:audit`(判定だけ)。AIから結果を見て、判定の妥当さを実際の保管庫で確かめる。
2. **モード(一覧だけ)**: `AuditResult`、`AuditProvider`、`PanelChoice`、フッターの表示。列はまだ今の4列のまま。
3. **列の組**: Table paletteの列をモードごとに持てるようにし、Vault auditの列を足す。保存済みのワークスペースの状態の移行をテストする。
4. **操作**: Enter、右クリック、ゴミ箱・アーカイブ、確認、CLIの`trash`・`archive`。
5. **仕上げ**: 設定画面、README、E2E(モードに入る→種類を変える→複数選択してゴミ箱)。

各段の終わりに`pnpm format:check`・`pnpm lint`・`pnpm check-types`・`pnpm test`を通す。

## この次: モードを登録するAPI

Vault auditを作ったあとで、ほかのプラグイン(My Commandsなど)がPaletteにモードを足せるAPIを別の計画にする。Vault auditで作る次のものが、そのAPIの中身になる。

- 列の組(3段目)
- 1つを選ぶオプション(`PanelChoice`)
- 結果を返す`PaletteProvider`と、右クリックの操作

先に内部のモードとして1つ動かし、要る形がわかってから外に出す。今`PaletteModeId`と`PaletteMode`が閉じたunion型になっているのを、登録されたモードも受け付ける形に変えるのが、そのAPIの一番大きな変更になる。

## 決めていないこと

- Canvasからのリンクが`resolvedLinks`に入るか(実装の1段目で確かめる)。
- 大きな保管庫での判定の時間。1段目のCLIで計る。数千ファイルで目立って遅ければ、結果を保持して差分で更新する。
- 壊れたリンクの「リンク先のノートを作る」操作。使う場面が出てきたら足す。
