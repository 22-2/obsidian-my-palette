# My Palette

My Palette は、キーボード操作を中心に使える Obsidian 用コマンドパレットです。Everything 1.5a の検索にも対応しています。

[English README](README.md)

## 開発

必要なものは Node.js と pnpm です。

- `vp install` で依存関係をインストールする
- `vp dev` でウォッチビルドを開始する
- `vp check` でフォーマット・lint チェックを実行する
- `vp test` でユニットテストを実行する
- `pnpm check-types` で TypeScript の型チェックを実行する
- `vp build` で本番用バンドルを作成する

Vite+ の設定により、本番用バンドルは `dist/` と設定済みの開発用 Vault のプラグインディレクトリへコピーされます。

## 使い方

- このリポジトリをクローンする
- `vp install` を実行する
- 開発中は `vp dev` を実行する
- バンドルがコピーされた開発用 Vault でプラグインを有効化または再読み込みする

Obsidian のコマンドパレットから `My Palette: Open Recent palette` を実行すると、最近使ったファイルを検索できます。`My Palette: Open command list` ではコマンド検索、`My Palette: Open palette in right sidebar` では右サイドバーのパレットを開けます。複数の独立した固定ビューを追加したい場合は、パレットビューのペインメニューから実行できます。必要に応じて Obsidian のホットキー設定から各コマンドにショートカットを割り当ててください。

通常のリスト表示は `My Palette: Open palette in right sidebar`、独立したテーブルビューは `My Palette: Open palette table in center` からセンターのタブに開けます。それぞれのコマンドは同じ種類の既存ペインを再利用し、別のビューの検索を置き換えません。各ビューのペインメニューから同じ種類のビューを複製できます。テーブルの複製は新しいセンターのタブに開きます。テーブルの列は名前・パス・更新日時・`prior` で、列ヘッダーのクリックだけでソート条件を追加し、方向の切り替えや解除ができます。他の列のソート条件は維持され、Shift キーは不要です。列ヘッダーのドラッグで列順を変更でき、ヘッダーの右クリックメニューで列の表示・非表示を切り替えられます。結果を識別できるように名前列は常に表示します。非表示の列もソート条件は維持されます。番号付きのソート操作から方向の反転、優先順位の前後移動、個別解除、`Reset` による検索順位への復帰ができます。更新日時や `prior` がない結果は末尾に並びます。ソート条件・列順・表示状態はテーブルのペインごとに保存され、複製や再起動後の復元にも引き継がれます。

テーブルは検索プロバイダーが返した全件をソートしてから50件ずつ表示します。ページの切り替えは上部の矢印ボタンから行えます。Everything 検索の取得件数は引き続き設定の上限に従います。

Everything モードを使うには、Everything 1.5a と公式 HTTP Server Plugin を起動しておく必要があります。

検索履歴と最近実行したコマンドのIDは Vault ごとのローカル IndexedDB に保存されます。既存の履歴は初回起動時に移行され、IndexedDB が利用できない場合は `data.json` を一時的なフォールバックとして使います。

### 検索モードのプレフィックス

既定のプレフィックスは次のとおりです。設定から変更できるプレフィックスもあります。

| プレフィックス | モード               | 用途                                               |
| -------------- | -------------------- | -------------------------------------------------- |
| なし           | Files                | Vault 内のファイルを検索                           |
| `>`            | Commands             | Obsidian のコマンドを検索・実行                    |
| `e `           | Everything           | Everything のインデックス全体を検索                |
| `esdir `       | Everything directory | 現在のノートがあるディレクトリを Everything で検索 |
| `bk `          | Bookmarks            | 保存したブックマークを検索                         |
| `sc `          | Smart Connections    | 現在のノートに関連するノートを検索                 |
| `i `           | Excluded files       | File 検索に除外ファイルを含める                    |

現在のノートに関係する検索では、`o ` でアウトリンク、`b ` でバックリンクを検索できます。実際のプレフィックスは設定画面の値が優先されます。

### 検索演算子

Everything 以外の検索モードでは、スペースで語を区切ると AND 検索になります。`|` で区切ると OR 条件になります。たとえば `meeting project | agenda` は、`meeting` と `project` の両方に一致するノート、または `agenda` に一致するノートを検索します。

Everything のクエリは変換せず、そのまま Everything 独自の検索構文へ渡されます。

### タグ検索

File 検索では、インラインタグと frontmatter の `tags` の両方を検索します。`#project` のようなクエリはタグを直接検索し、通常の検索語でもタグに fuzzy match します。一致したタグはファイル名の下に最大3件表示され、残りは `+N` にまとめられます。行にカーソルを合わせると、一致したタグ全体を確認できます。

### タグの追加

`My Palette: Insert tags into current note` を実行すると、開いているノートの frontmatter の `tags` にタグを追加できます。検索結果のノートに追加する場合は、パレットの結果を右クリックして `Add tags…` を選びます。複数の結果を選択していると、選択したすべての Markdown ノートに同じタグを追加します。除外ファイルは対象外です。

候補は、最近追加したタグ、リンクでつながったノート（アウトリンクとバックリンク）で使われているタグ（最大10件、`Related N` と表示）、使用回数の順に並びます。対象のノートすべてに登録済みのタグは `Registered` として末尾に表示され、選択できません。一部のノートにだけ付いているタグは `On N/M notes` と表示され、選択できます。`Enter` でリストを閉じずに選択・解除を切り替え、`Ctrl+Enter` または `Add …` の行で追加を確定します。存在しないタグを入力すると、新しいタグとして追加できます。登録済み・一部登録のタグを右クリックして `Remove tag` を選ぶと、対象ノートの frontmatter からタグを削除できます。選択中のタグを右クリックすると、選択したすべてのタグを削除します。最近追加したタグは Vault ごとのローカル IndexedDB に保存されます。

### MOC への挿入

MOC への挿入も同じ操作です。`Enter` でノートの選択・解除を切り替え、`Ctrl+Enter` または `Insert …` の行で、選択したすべてのノートへの相互 Relateds リンクをアクティブな MOC に追加します。双方向にリンク済みのノートは末尾に表示され、選択できません。片方向だけのノートはリンクを補完するために選択できます。リンク済みのノートを右クリックして `Remove link` を選ぶと、双方向の Relateds リンクを削除できます。選択中のノートを右クリックすると、選択したすべてのノートのリンクを削除します。

### ファイルのソート

ファイルの並び順は `Settings → My Palette → Vault file search → Sort priorities` で、1行につき1つの priority を指定して設定します。上から順に比較し、差がついた最初の priority が採用されます。

利用できる priority は `Filename prefix match`、`Filename fuzzy match`、`Alias prefix match`、`Alias fuzzy match`、`Tag match`、`Match coverage`、`Folder path match`、`Activity`、`Last modified`、`Aliases count`、`Alphabetical`、`Alphabetical reverse`、および任意の `:asc` / `:desc` を付けられる `@prior` です。`prior` が未設定のファイルは後ろに置かれます。

| ソートキー              | 説明                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `Filename prefix match` | ファイル名が検索語で始まる候補を先に置く                                                           |
| `Filename fuzzy match`  | ファイル名の fuzzy score が高い候補を先に置く                                                      |
| `Alias prefix match`    | alias が検索語で始まる候補を先に置く                                                               |
| `Alias fuzzy match`     | alias の fuzzy score が高い候補を先に置く                                                          |
| `Tag match`             | 検索に一致したタグが多い候補を先に置く                                                             |
| `Match coverage`        | ファイル名・パス・alias・tag で一致した検索文字数が多い候補を先に置く                              |
| `Folder path match`     | ファイル名を除いた相対フォルダーパスの fuzzy score が高い候補を先に置く                            |
| `Activity`              | 最近開いた順を優先し、最近開いた履歴で差がつかない候補では永続利用履歴のスコアが高い候補を先に置く |
| `Last modified`         | ファイルの更新日時が新しい候補を先に置く                                                           |
| `Aliases count`         | alias の数が多い候補を先に置く                                                                     |
| `Alphabetical`          | ファイル名、次に相対パスの昇順で並べる                                                             |
| `Alphabetical reverse`  | ファイル名、次に相対パスの降順で並べる                                                             |
| `@prior` / `@prior:asc` | frontmatter の数値 `prior` が小さい候補を先に置く                                                  |
| `@prior:desc`           | frontmatter の数値 `prior` が大きい候補を先に置く                                                  |

`@prior:desc` は frontmatter の数値 `prior` が大きいノートを先に置きます。既定では、ファイル名、alias、タグ、検索範囲、フォルダーパス、`prior`、`Activity`、更新日時の順に評価します。

`Settings → My Palette → Vault file search → Lower prior folders` にフォルダーパスを1行ずつ指定し、`Sort priorities` の独立した項目 `Lower prior folders` を有効にすると、その配下のノートを後ろに並べられます。`@prior` が無効でも使えます。名前・更新日時などより優先したい場合は、それらの項目より上に置いてください。空入力と入力ありでそれぞれ設定します。完全な連続一致と include-ignored の優先は従来どおり先に評価されます。既存のフォルダー指定がある設定は、更新時にこの項目を各リストの先頭へ追加します。

`Folder path match` はファイル名を除いた Vault 内の相対フォルダーパスを比較します。`Activity` は Obsidian の最近開いた順を先に使い、同じ状態の候補ではパレットの永続利用履歴をタイブレークに使います。`Last modified` は明示的に指定した場合だけ更新日時で比較し、設定した priority がすべて同点なら Vault 内の相対パスを決定的なフォールバックに使います。

完全な連続一致がある候補は、設定した fuzzy 系 priority より先に置かれます。`Tag match` は一致したタグ数、`Match coverage` はファイル名・パス・alias・tag に含まれる一致文字数、`Aliases count` は alias の数を基準に並べます。

## 手動インストール

`main.js`、`styles.css`、`manifest.json` を Vault の次のディレクトリへコピーします。

```text
VaultFolder/.obsidian/plugins/my-palette/
```

その後、Obsidian の設定から My Palette を有効化してください。

## リリース

- `manifest.json` のバージョン番号と、対応する最低 Obsidian バージョンを更新する
- `versions.json` に `"新しいプラグインバージョン": "最低Obsidianバージョン"` の対応を追加する
- 新しいバージョン番号を GitHub Release の Tag version としてリリースを作成する。`v` などの接頭辞は付けない
- `manifest.json`、`main.js`、`styles.css` をバイナリ添付する
- リリースを公開する

`minAppVersion` を手動で更新したあと、`npm version patch`、`npm version minor`、`npm version major` を使うとバージョン更新を簡略化できます。コマンドは `manifest.json` と `package.json` のバージョンを更新し、`versions.json` に新しいエントリを追加します。

## コミュニティプラグイン一覧への追加

- [Obsidian の plugin review ガイド](https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md)を確認する
- 初回バージョンを公開する
- リポジトリのルートに `README.md` があることを確認する
- [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) に追加用の Pull Request を作成する

## コード品質

フォーマットと lint は Vite+ の `vp check` で実行します。型チェックとテストは個別に実行できるため、リファクタリング中も分けて確認できます。

## Funding URL

`manifest.json` に Funding URL を設定すると、利用者がプロジェクトを支援するためのリンクを追加できます。

```json
{
	"fundingUrl": "https://buymeacoffee.com"
}
```

複数のリンクを設定する場合は、次のようにします。

```json
{
	"fundingUrl": {
		"Buy Me a Coffee": "https://buymeacoffee.com",
		"GitHub Sponsor": "https://github.com/sponsors",
		"Patreon": "https://www.patreon.com/"
	}
}
```

## API ドキュメント

[Obsidian API](https://github.com/obsidianmd/obsidian-api)を参照してください。
