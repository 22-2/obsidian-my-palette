# My Palette

まずファイルを見つけて、その扱い方は見つけたあとに決める Obsidian 用パレットです。見た目は VS Code のコマンドパレットがベースですが、キーボードだけでなくマウスでも同じくらい快適に使えるように作っています。

[English README](README.md)

## なぜ作ったか

Another Quick Switcher、標準の Quick Switcher、Quick Switcher++、Omnisearch を一通り使いましたが、どれも一長一短で、全体としてしっくりきませんでした。それで自分で作りました。

最初は VS Code のパレットをほぼそのまま真似していました。文字を入力し、候補を選び、実行する、という流れです。ただ、Obsidian では「どれを実行するか」以外に決めることが多く、この文法は合いませんでした。

- **対象**: どのノート、どの外部ファイルか
- **検索元**: Vault、Everything、リンク、バックリンク、ブックマークのどれか
- **開き方**: 現在のタブ、別タブ、分割、サイドバーのどれか
- **操作**: 開く以外に、パスのコピー、MOC への挿入、タグ付け、移動などもある

そこで現在は次の流れにしています。

1. 探したいものを自然に入力する。通常のファイル検索にモード切り替えは要りません。
2. 扱い方は結果を選んだあとに決める（クリック、ダブルクリック、中クリック、右クリック、キー操作）。
3. 高度な操作は、適用する結果があるときだけ表示する。

ほかの検索元（コマンド、Everything、ブックマークなど）は、Home（モードに入る前のパレット）から一歩で入れるモードで、操作の主役ではありません。

## 機能

- **Vault のファイル検索**: AND / OR 検索、alias、frontmatter の `keywords`、frontmatter とインラインのタグに対応し、並び順を細かく設定できます。
- **Everything 1.5a 検索**: Vault 外のファイルも検索でき、Markdown は Obsidian で、それ以外は OS の関連付けアプリで開きます。
- **コマンド・ブックマーク・リンク・バックリンク・Smart Connections の検索**を同じウィンドウで行えます。
- **複数選択**: ファイルマネージャーと同じ操作で選び、選択したノートへまとめてパスのコピー、タグ追加、MOC リンク挿入ができます。
- **3つの表示面**: モーダルの Palette、右サイドバーの Sidebar palette、センタータブでソートできる Table palette。
- **Obsidian-excluded files は必要なときだけ**: Obsidian の「Excluded files」で除外されたファイル（Obsidian-excluded files）は普段は出さず、`Obsidian-excluded` スイッチ（`Ctrl+I`）をオンにしたときだけ検索対象にできます。
- デスクトップ専用です（主な対象は Windows）。

## はじめかた

Obsidian のコマンドパレットから次のコマンドを実行します。必要に応じてホットキーを割り当ててください。

| コマンド                                  | 内容                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| `My Palette: Open home`                   | Home：モードの一覧と最近使ったファイル                   |
| `My Palette: Open note list`              | Notes モードから始まる                                   |
| `My Palette: Open run list`               | Commands モードから始まる                                |
| `My Palette: Open sidebar palette`        | Sidebar palette：右サイドバーに常駐するリスト            |
| `My Palette: Open table palette`          | Table palette：センターのタブに常駐するテーブル          |
| `My Palette: Open outgoing link list`     | 現在のノートからのリンク先                               |
| `My Palette: Open backlink list`          | 現在のノートへのリンク元                                 |
| `My Palette: Open bookmark list`          | 保存したブックマーク                                     |
| `My Palette: Open Smart Connections list` | 現在のノートに関連するノート（Smart Connections が必要） |
| `My Palette: Open tab list`               | 開いているタブ                                           |
| `My Palette: Open folder move selector`   | 現在のファイルを別フォルダーへ移動                       |
| `My Palette: Open tag insert selector`    | 現在のノートにタグを追加                                 |
| `My Palette: Open MOC insert selector`    | アクティブな MOC に相互 Relateds リンクを追加            |
| `My Palette: Open MOC remove selector`    | アクティブな MOC から Relateds リンクを削除              |

## パレットの使い方

### マウスとキーボード

Palette、Sidebar palette、Table paletteは、入力中も先頭候補を強調したままにします。そのため `Enter` ですぐ実行でき、`↑`／`↓` で候補を移動できます。タグ挿入と MOC 挿入では `Space` で候補をチェックするため、入力モードと選択モードを分けています（後述）。

Tag insert selector、MOC insert selector、MOC remove selector、Folder move selector にも、アクション（`…`）と履歴（時計）のボタンを表示します。アクションとヘルプはその selector に合わせた内容です。履歴は selector ごとに分かれ、選択しても検索語を復元するだけで、タグ挿入・リンク追加・ファイル移動は実行しません。`Ctrl+R` でも履歴を開けます。履歴の有効／無効・保存待ち時間・保持期間は既存の設定を使い、ハイライト設定はモーダル間で共有します。

| 操作                     | 動作                                     |
| ------------------------ | ---------------------------------------- |
| クリック                 | 結果を選択                               |
| `Ctrl`+クリック          | 選択に追加 / 選択から除外                |
| `Shift`+クリック         | 範囲選択                                 |
| ダブルクリック / `Enter` | 結果を開く（コマンドなら実行）           |
| 中クリック               | 新しいタブをバックグラウンドで開く       |
| 右クリック               | アクションメニュー（選択中の全件が対象） |
| `Ctrl+R`                 | 検索履歴                                 |
| `Esc`                    | モードから戻る。Homeでは閉じる/クリア    |

アクションメニューには、開く、バックグラウンドタブで開く、左右に分割して開く、下に分割して開く、外部エディターで開く、システムエクスプローラーで表示、ターミナルで開く、ファイル名・Vault 相対パス・絶対パスのコピー、別フォルダーへの移動（`Move to…`。複数選択していれば選択したファイルをまとめて移動。Obsidian-excluded の Markdown ノートは先に保管庫へ取り込みます）、MOC への挿入、タグの追加があります。メニューボタンの `Help` に、その画面で使える操作をまとめています。パレットのモーダル下部には `Obsidian-excluded` スイッチを表示します。そのほかのキー操作と挿入先の情報はヘルプで確認できます。`Alt+H` を押している間は、モーダルと背後の暗幕を非表示にして、プレビューを確認できます。どちらかのキーを離すと再表示して検索欄にフォーカスを戻します。モードの中では `Esc` でHomeに戻ります。Homeの `Esc` は、モーダルでは閉じる操作、常設ビューでは検索語をクリアしてから入力欄へ戻る操作です。

### 検索モード

`My Palette: Open home` は、Raycast のようにモードの一覧をファイルの上に並べた Home（モードに入る前のパレット）から始まります。モードの行で `Enter` か `Tab` を押すか、エイリアスに続けてスペースを入力すると、そのモードに入ります。エイリアスは入力欄から消えて左側のチップになり、入力欄には検索語だけが残ります。`Esc`（空の入力欄での `Backspace`、チップのクリックでも可）でHomeに戻り、エイリアスが選択された状態になるので、`Enter` でもう一度同じモードに入れます。Homeで `Esc` を押すとパレットを閉じます。

| エイリアス | モード         | 用途                                                         |
| ---------- | -------------- | ------------------------------------------------------------ |
| なし       | Files          | Vault 内のファイルを検索                                     |
| `n`        | Notes          | Home から Obsidian 標準のファイル検索に入る                  |
| `>`        | Commands       | Obsidian のコマンドを検索・実行                              |
| `e`        | Everything     | Vault のファイルを検索。Obsidian-excluded オンで全種類       |
| `o`        | Outgoing links | 現在のノートからリンクしているノート                         |
| `b`        | Backlinks      | 現在のノートへリンクしているノート                           |
| `bk`       | Bookmarks      | 保存したブックマークを検索                                   |
| `sc`       | Related notes  | 現在のノートに関連するノート（Smart Connections）            |
| `t`        | Tabs           | 開いているタブへ切り替え                                     |
| `p`        | Plugins        | インストール済みプラグインのフォルダーを外部エディターで開く |
| `sn`       | Snippets       | CSS スニペットを外部エディターで開く                         |
| `pr`       | Properties     | 現在のノートのプロパティを検索して編集する                   |

Plugins はインストール済みのプラグインを名前順に並べ、無効なものには印を付けます。Snippets は先頭に snippets フォルダーの行、その後に各スニペットを有効・無効付きで並べます。`Enter` でフォルダーやファイルを外部エディター（当面は VS Code）で開きます。メニューにはシステムエクスプローラーでの表示、ターミナルで開く、パスのコピーもあり、設定タブのあるプラグインには設定を開く項目が出ます。

Properties は現在のノートのプロパティを **This note**、予約キー（`aliases`、`tags`、`cssclasses`）を **Reserved**、保管庫の他のノートで使われているキーを **Vault** の見出しで並べます。`Enter` は型に合わせて編集します。タグは Tag insert selector を開き、リストは値の selector を開き、チェックボックスはその場で切り替え、テキスト・数値・日付・日時は入力欄に値を打ちます。どのキーにも一致しない名前を入力すると、型を選んでそのキーを追加できます。ネストした値は source mode で編集します。右クリックメニューには値のコピー、プロパティの削除、プロパティ名のコピーもあります。型は保管庫の設定を読むだけで、Palette からは変更しません。

すべてのエイリアスは **設定 → My Palette → Modes** で変更でき、モードごとにオフにできます。モードをオフにするか、**Integrations** で連携をオフにすると、そのモードはHomeとエイリアス入力から外れます。Table paletteはモードの一覧を出しませんが、エイリアスでモードに入れます。`Open note list` や `Open backlink list` など、モードを直接開くコマンドはそのモードから始まり、`Esc` でHomeに戻ります。

下部左端の `Obsidian-excluded` スイッチ（`Ctrl+I`）をオンにすると、Obsidian の「Excluded files」で除外されたファイル（Obsidian-excluded files）も検索します。ファイル検索でだけ有効で、ほかのモードでは薄く表示します。検索履歴は除外ファイルを含めたかどうかも記録し、履歴を選ぶとスイッチも復元します。

### 検索構文

Everything 以外のモードでは、スペース区切りが AND、`|` 区切りが OR です。たとえば `meeting project | agenda` は、`meeting` と `project` の両方を含むノート、または `agenda` を含むノートに一致します。

ファイル検索はインラインタグと frontmatter の `tags` の両方を対象にします。`#project` はタグを直接検索し、通常の検索語でもタグに一致します。一致したタグはファイル名の下に最大3件表示され、残りは `+N` にまとまります。行にカーソルを合わせると全件を確認できます。

frontmatter の `keywords` も文字列配列として検索対象になります（例: `keywords: [宇宙, 星空観察]`）。`Obsidian-excluded` スイッチで検索する Obsidian-excluded filesにも対応します。一致した keywords はタグの隣に `#` なしで表示し、合わせて最大3件、残りは `+N` にまとめます。チップにカーソルを合わせると全件を確認できます。`#` 付きの語だけを入力した場合はタグのみを検索します。

Everything のクエリは変換せず、そのまま Everything 独自の構文に渡されます。Everything モードには Everything 1.5a と公式 HTTP Server Plugin の起動が必要です。詳しくは [Everything の設定](#everything-の設定)を参照してください。

## 複数のノートをまとめて扱う

選択操作は、パレット、Tag insert selector、MOC insert selector、MOC remove selector で共通です。クリック、`Ctrl` / `Shift`+クリック、矢印キーで選びます。

### タグの追加

`Open tag insert selector` を実行するか、結果を右クリックして `Add tags…` を選びます。複数の結果を選択していると、選択したすべての Markdown ノートに同じタグを追加します。除外ファイルは対象外です。

- 候補は、最近追加したタグ、リンクでつながったノートで使われているタグ（最大10件、`Related N` と表示）、使用回数の順に並びます。
- 対象すべてに登録済みのタグは `Registered` として末尾に表示され、選択できません。一部だけに付いているタグは `On N/M notes` と表示され、選択できます。
- 最初は入力モードで、Space も検索文字として入力できます。`↑`／`↓` または結果のクリックで選択モードへ移り、`f` または入力欄のクリックで入力モードへ戻ります。
- チェック済みのタグは、新規タグも含めて検索語に関係なく常に先頭に表示します。チェックを外すと通常の検索結果に戻ります。
- `→` で選択中のタグを Obsidian 標準の Search に表示し、モーダルのフォーカスを維持します。入力モードではカーソルが検索語の末尾にあるとき、選択モードではカーソル位置に関係なく使えます。
- 選択モードの `Space`、右クリックメニュー、チェックアイコンのクリック（その行だけ切り替え）でチェックを切り替えます。`Enter`（テンキー Enter も含む）またはダブルクリックで選択中の行をすぐ反映します。ノートにまだないタグは追加し、すべての対象が持つタグは削除します。すべての対象が持つタグは最初からチェック済みで、チェックを外すと削除の変更になります。`Ctrl+Enter` で保留中の変更（チェックしたタグの追加と、チェックを外したタグの削除）をまとめて反映します。右クリックメニューの `Add N now` で、チェック済みと選択中の行をまとめてすぐ実行することもできます。
- 入力欄右端のボタンでチェック済みの一覧を確認し、チェックを外したり実行したりできます。
- 存在しないタグを入力すると、新しいタグとして追加できます。
- 登録済み・一部登録のタグを右クリックして `Remove tag` を選ぶと、対象ノートからタグを削除できます。複数行を選択していれば、選択した全タグを削除します。

最近追加したタグは Vault ごとのローカル IndexedDB に保存されます。

### MOC への挿入

MOC insert selector も同じ入力／選択モードと操作です。相互にリンク済みのノートは最初からチェック済みで、チェックを外して `Ctrl+Enter` を押すとリンクを外します。`Enter` は選択中の行のリンクをすぐ外します。チェック済みのノートは検索語に関係なく常に先頭に表示します。`→` で選択中のノートをプレビューし、モーダルのフォーカスを維持します。`Enter` で選択中のノートを即挿入し、選択モードの `Space` でチェックを切り替えます。`Ctrl+Enter` または入力欄右端のチェック済み一覧ボタンで、チェックしたすべてのノートへの相互 `Relateds` リンクを最初に開いていた MOC に追加します。別のノートをプレビューしても挿入先は変わりません。リンクの有無は `Relateds` 項目内のものだけで判定し、本文中の他のリンクは数えません。

双方向にリンク済みのノートは末尾に表示され、選択できません。片方向だけのノートは、リンクを補完するために選択できます。リンク済みのノートを右クリックして `Remove link` を選ぶと、双方向の Relateds リンクを削除できます。

## ビュー

`Open sidebar palette` は Sidebar palette、`Open table palette` は センタータブの Table palette です。それぞれ同じ種類の既存ペインを再利用し、もう一方の検索を置き換えません。ペインメニューから複製もできます。

Table palette では次の操作ができます。

- 列ヘッダーをクリックすると、ソート条件に追加するか、方向を切り替えて解除できます。他のソート条件は維持され、修飾キーは不要です。
- ヘッダーをドラッグして列順を変更し、ヘッダーを右クリックして列の表示・非表示を切り替えられます（名前列は常に表示）。
- 番号付きのソート操作で、方向の反転、優先順位の前後移動、個別解除、検索順位への復帰ができます。
- 列は名前・パス・更新日時・`prior` です。値がないものは末尾に並びます。
- ソート条件・列順・非表示の列は、ペインごとに保存され、複製や再起動後も引き継がれます。
- 1ページ50件で、検索プロバイダーが返した全件をソートしてから分割します。Everything 検索の取得件数は設定の上限に従います。

## ファイルのソート

並び順は `Settings → My Palette → File search → Sort priorities` で、空入力と入力ありのそれぞれについて設定します。有効な項目を上から順に比較し、差がついた最初の項目が採用されます。すべて同点なら Vault 内の相対パスで決まります。

| ソートキー                              | 先に置かれる候補                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `Filename prefix match`                 | ファイル名が検索語で始まる                                                     |
| `Filename fuzzy match`                  | ファイル名の fuzzy score が高い                                                |
| `Alias prefix match`                    | alias が検索語で始まる                                                         |
| `Alias fuzzy match`                     | alias の fuzzy score が高い                                                    |
| `Tag match`                             | 一致したタグが多い                                                             |
| `Match coverage`                        | ファイル名・パス・alias・タグ・keywords で一致した文字数が多い（最良の OR 枝） |
| `Folder path match`                     | ファイル名を除いたフォルダーパスの fuzzy score が高い                          |
| `Lower prior folders`                   | 設定したフォルダー配下を後ろへ送る（下記）                                     |
| `Activity`                              | 最近開いた順。差がつかなければ永続的な利用履歴のスコアが高い                   |
| `Last modified`                         | 更新日時が新しい                                                               |
| `Aliases count`                         | alias の数が多い                                                               |
| `Alphabetical` / `Alphabetical reverse` | ファイル名、次にパスの昇順 / 降順                                              |
| `@prior` / `@prior:asc`                 | frontmatter の数値 `prior` が小さい                                            |
| `@prior:desc`                           | frontmatter の数値 `prior` が大きい                                            |

`prior` がないノートは末尾です。ファイル名・パス・alias・タグ・keywords のいずれかに完全な連続一致がある候補は、この一覧を適用する前に fuzzy のみの一致より先に置かれます。

`Lower prior folders` には、フォルダーパスを1行ずつ指定します（サブフォルダーを含む）。`Sort priorities` で同名の項目を有効にすると、`@prior` なしでもその配下のノートを後ろに並べられます。名前や Activity より優先したい場合は、それらより上に置いてください。include-ignored の優先は従来どおり先に評価されます。

## 設定

設定は5ページに分かれています。**General**（Home に戻るまでの時間、検索履歴、ハイライト、デバッグメッセージ）、**Modes**（各モードのエイリアスと有効/無効）、**File search**（対象拡張子、Excluded folders、Obsidian-excluded files のインデックス、ソート）、**Shortcuts**（ホットキーの表）、**Integrations**（Everything、Smart Connections、VS Code）です。

### ショートカット

**設定 → My Palette → Shortcuts** で、パレットと選択画面のホットキーを1つの表で見られます。操作名、キー、使える場所（Palette、File search、Tag、MOC +、MOC −ごとの●。すべてのパレットと選択画面で使えるものは1つのセルにまとめます）、既定値への戻しを並べ、操作名・キー・使える場所で絞り込めます。キーをクリックして新しいキーを押すと記録され、`Esc` で取り消し、`Backspace` か `Delete` で無効にできます。重複はその行の下に表示されます。変更はすぐに開いているパレットへ反映されます。

### Everything の設定

1. Everything 1.5a と公式 HTTP Server Plugin をインストールして起動する。
2. `Settings → My Palette → Integrations` で **Everything** を押して設定を展開し、HTTP server URL（ユーザー名・パスワードを設定した場合はそれも）を入力し、`Test connection` を押す。

通信は localhost のみで、外部サービスには何も送信しません。

### Return to Home after

`My Palette: Open home` は、閉じたときの入力・Obsidian-excluded スイッチの状態・選択行・スクロール位置を、**設定 → My Palette → General → Return to Home after** で決めた時間（Immediately、30、60、90 秒。既定は 90 秒）以内に開き直すと復元します。それ以外はHomeの空の状態から始まります。復元した検索語は選択された状態になるので、そのまま打ち直せます。この状態はメモリーにだけ保持し、Obsidian を再起動するとHomeから始まります。

### 検索履歴

検索履歴と最近実行したコマンドの ID は Vault ごとのローカル IndexedDB に保存されます。IndexedDB が使えない場合に限り、`data.json` を一時的なフォールバックとして使います。

## インストール

コミュニティプラグイン一覧にはまだ登録されていません。手動でインストールするには、リリースの `main.js`、`styles.css`、`manifest.json` を `VaultFolder/.obsidian/plugins/my-palette/` にコピーし、Obsidian の設定で My Palette を有効化してください。

## 開発

ビルドには Node.js と pnpm が必要です。ビルド・テスト・リリースの手順は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照してください。
