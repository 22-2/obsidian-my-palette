# Propertiesモードの計画

現在のノートのプロパティ(フロントマター)を、Paletteから選んで編集できるようにする。キーを検索して選び、Enterで型に合った編集を始める。

Obsidian本体のProperties viewはキーの一覧だけで、値を見たり付け外ししたりするにはノートへ移る必要がある。公式ヘルプも、Properties view以外での一括編集は弱いと書いている。

## 決めたこと

| 項目             | 内容                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 置き場所         | Paletteのモード(Plugins・Snippetsと同じ作り)                                                                                                                                        |
| モード名         | Properties                                                                                                                                                                          |
| エイリアス       | `pr`(`p`はPlugins。エイリアスは`alias + Space`で照合するので共存できる)                                                                                                             |
| 対象             | 現在のノート(リンクのモードと同じ`sourceFile`)                                                                                                                                      |
| `tags`           | 既存のTag insert selectorに回す                                                                                                                                                     |
| List型の編集     | 新しいSelector(Property value selector)。Tag insert selectorと同じ共通の複数選択の部品を使う                                                                                        |
| 型               | 読むだけ。Paletteから型を設定・変更しない                                                                                                                                           |
| 付け外しの確定   | Tag insert・MOC insert・Property valueの3つのSelectorで揃える。チェックは付けるのも外すのも保留にして`Ctrl+Enter`でまとめて実行し、1行に対する操作(Enter、右クリック)はすぐ実行する |
| 閉じるときの確認 | 出さない。Escで閉じると、保留の変更は今と同じく捨てる(手間を増やさないため)                                                                                                         |

## 用語(実装の最初にGLOSSARYへ足す)

| 正式名                  | 種類     | 意味                                             | 識別子                                                   |
| ----------------------- | -------- | ------------------------------------------------ | -------------------------------------------------------- |
| Properties              | モード名 | 現在のノートのプロパティを検索して編集するモード | `PaletteModeId`は`properties`、`PaletteMode`は`property` |
| Property value selector | Selector | List型のプロパティの値を付ける・外す・新しく足す | ショートカットの範囲`property-value-selector`            |
| Property value input    | Selector | Text・Number・Date・Date & timeの値を1つ入力する | ショートカットの範囲を分けるかは実装時に決める           |

- Selectorの名前は「対象 + 操作 + selector」の決まりに合わせる。Property value inputは候補を選ぶより入力が主なので、`selector`を付けるかをGLOSSARYに足すときに決める。
- 見出し(セクション名)は「This note」「Reserved」「Vault」。
- 対応するコマンド「Open property list」は、使ってみて要るとわかってから足す。

## 使うAPI

| やりたいこと                   | API                                                                               | 公開                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 現在のノートのプロパティを読む | `metadataCache.getFileCache(file)?.frontmatter`                                   | 公開                                                                               |
| 書き込む                       | `fileManager.processFrontMatter(file, fn)`                                        | 公開。読み込み・変更・保存を一度に行う。YAMLが壊れていると`YAMLParseError`を投げる |
| 保管庫全体のキーと使用数       | `metadataCache.getAllPropertyInfos()`                                             | 非公式                                                                             |
| キーの型                       | `metadataTypeManager.getAssignedWidget(key)`、無ければ`getAllPropertyInfos()`の型 | 非公式                                                                             |
| キーごとの既存の値             | `metadataCache.getFrontmatterPropertyValuesForKey(key)`                           | 非公式                                                                             |

非公式APIは、`src/search/snippet/SnippetProvider.ts`と同じく`as unknown as`で必要な形だけを型にし、関数や値が無ければ空として扱う。非公式APIが無くなっても、This noteとReservedの一覧と編集は動くようにする(Vaultの見出しと値の候補が出なくなるだけ)。

### 型の扱いで気を付けること

- **型を書き換えない**: 型は保管庫全体で共有される。プラグインが`setType`を呼んでユーザーの型を変えてしまう不具合が報告されている([obsidian-map-view#358](https://github.com/esm7/obsidian-map-view/issues/358))。Paletteは型を読むだけにする。
- **型の情報の形が変わる**: プロパティの情報は以前`type`、今は`widget`に型が入っている([tasknotes#1615](https://github.com/callumalpass/tasknotes/issues/1615)、[obsidian-typings#129](https://github.com/obsidian-typings/obsidian-typings/issues/129))。両方を見る。
- **型が決まっていないキー**: 値から推測する。配列ならList、`true`/`false`ならCheckbox、数値ならNumber、`YYYY-MM-DD`ならDate、それ以外はText。推測はPalette内の表示と編集の切り替えにだけ使い、保存しない。
- 型の判定は純粋な関数にまとめ、単体テストを書く。

## 一覧

### 見出しと並び

`src/ui/suggestionPanel.ts`の`sectionOf`で見出しを出す。

| 見出し    | 中身                                                      | 空入力での並び                 |
| --------- | --------------------------------------------------------- | ------------------------------ |
| This note | 現在のノートにあるキー(Reservedのキーを除く)              | フロントマターに書かれている順 |
| Reserved  | `aliases`、`tags`、`cssclasses`。ノートに無くても常に出す | この順で固定                   |
| Vault     | 保管庫で使われていて、現在のノートに無いキー              | 使用数の多い順                 |

- 見出しの順は、This note → Reserved → Vault。
- 入力時はキー名をあいまい検索し、見出しは保ったまま、見出しの中をスコア順にする。Vaultは件数が多いので、上限を設ける(Notesの件数上限と同じ扱い)。
- 入力がどのキーとも一致しないときは、末尾に「新しいプロパティとして追加」の行を出す(下記)。

### 1行の表示

| 位置     | 内容                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| アイコン | 型のアイコン(Obsidianの型アイコンに合わせる)                                               |
| 1行目    | キー名                                                                                     |
| 2行目    | This note・Reservedは値。Listは`, `区切りで、長いものは省略する。Vaultは使用数(`12 notes`) |

- ノートに無いReservedのキーは、2行目を「Not set」にする。
- ネストしたオブジェクトなど、編集できない値は2行目に`{…}`と出し、鍵のアイコンを付ける。

### 現在のノートが無いとき

Outgoing links・Backlinksと同じく、空の一覧と案内を出す。Markdown以外のファイルが現在のノートのときも同じ(`processFrontMatter`はMarkdownだけ)。

## Enterの動き

型で分ける。キーがノートに無い(Reservedの未設定、Vault)ときも同じ動きで、書き込むときにキーが足される。

| 型                                  | Enter                                                          |
| ----------------------------------- | -------------------------------------------------------------- |
| Tags(`tags`)                        | Tag insert selectorを開く(`insertTags(plugin, [file])`)        |
| List(`aliases`、`cssclasses`を含む) | Property value selectorを開く                                  |
| Checkbox                            | その場で切り替え、結果を通知する。キーが無いときは`true`で足す |
| Text、Number、Date、Date & time     | Property value inputを開く                                     |
| 編集できない値                      | 「Edit this property in source mode.」と通知する               |

### 新しいプロパティの行

入力がどのキーとも一致しないときに出す。Enterで、入力をキー名として型を選ぶ(Text、List、Number、Checkbox、Date、Date & time)。選んだ型の編集を続けて開き、値が決まったときに書き込む。

- 型を選ぶ一覧は既存の`SelectionModal`を使う。
- ここで選んだ型も保存しない。保管庫に型が無いキーとして書かれ、Obsidian本体が値から推測する。
- 最初の段階では入れなくてもよい(下記の進め方)。

## Selectorの付け外しを揃える

Property value selectorは、同じ画面で値を付けたり外したりを何度も行う。今の`MultiSelectModal`は「付けるのはチェックして保留、外すのは右クリックですぐ実行」が混ざっていて、どこまで実行済みかがわかりにくい。Property value selectorを作る前に、`MultiSelectModal`の動きを次のように揃え、Tag insert selectorとMOC insert selectorも同じ動きにする。MOC remove selectorは、外すことが主な操作で、すでに「チェックして`Ctrl+Enter`」の形なので変えない。

### 決まり

**チェックは保留、1行に対する操作はすぐ実行する。**

| 操作                                                         | 付いていない行                                     | 付いている行                         |
| ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------ |
| チェックの切り替え(クリック、Space、`Ctrl`・`Shift`での選択) | 付ける変更として保留                               | 外す変更として保留                   |
| `Ctrl+Enter`、チェック済みの一覧のボタン                     | 保留の変更(付ける・外す)をまとめて実行し、閉じる   | ←                                    |
| Enter                                                        | その行をすぐ付けて閉じる(今と同じ)                 | その行をすぐ外して閉じる             |
| 右クリックの「Remove …」                                     | —                                                  | その行をすぐ外す(今と同じ。閉じない) |
| Esc、外側のクリック                                          | 保留の変更を捨てて閉じる。確認は出さない(今と同じ) | ←                                    |

- 付いている行は、今の`locked`(鍵のアイコンでチェックできない)をやめ、チェックの状態として「付いている」を見せる。チェックを外すと、外す変更として保留になったことがわかる見た目にする(取り消し線など)。
- 一部のノートにだけ付いている行(Tag insert selectorで複数のノートが対象のとき)は、チェックすると残りのノートに付ける変更になる。外すのは今と同じく右クリックで行う。
- フッターのチェック済みの数は、保留の変更の数として「+2 −1」のように出す。
- 実行後の通知は1回にまとめる(例: 「Added #a #b and removed #c on <note>.」)。
- MOC insert selectorの「付いている行」は、今`locked`にしている相互リンク済みの行。外す変更はリンクを外す処理(今の`removal`)を使う。

### 変わるところ

| ファイル                                                              | 変更                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/MultiSelectModal.ts`                                          | 行に「付いているか」を持たせ、チェックを付ける・外すの保留として扱う。`openAndWait()`の結果を、付ける値と外す値の組にする。Enterが付いている行で外す動きを足す |
| `src/tags/TagSelectionModal.ts`、`src/tags/insertTags.ts`             | 新しい結果を受け取り、付ける・外すをまとめて書き込む                                                                                                           |
| `src/moc-relateds/mocRelateds.ts`、`src/moc-relateds/mocInsertion.ts` | 同上                                                                                                                                                           |
| `src/ui/selectorControls.ts`                                          | ヘルプのショートカットの説明                                                                                                                                   |

- 変える前に、Tag insert selectorとMOC insert selectorの今の動きを、単体テストとE2Eで押さえておく。変えたあとで、付ける側の動きが変わっていないことを確かめる。
- READMEのSelectorの説明も合わせて直す。

## Property value selector(List)

`src/ui/MultiSelectModal.ts`の上に作る。`src/tags/TagSelectionModal.ts`とほぼ同じ形になり、付け外しは上の決まりに従う。

| 行           | 内容                                                                          | 操作                                                                          |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 付いている値 | 現在のノートの値。チェックが付いた状態で出す                                  | チェックを外して`Ctrl+Enter`、Enter、または右クリックの「Remove value」で外す |
| 候補の値     | `getFrontmatterPropertyValuesForKey(key)`の値から、付いているものを除いたもの | チェックして`Ctrl+Enter`、またはEnterで足す                                   |
| 新しい値     | 入力がどの候補とも一致しないとき、入力そのもの                                | チェックして`Ctrl+Enter`、またはEnterで足す                                   |

- 並びは、付いている値をあとにする(Tag insert selectorで登録済みのタグをあとにするのと同じ)。
- `cssclasses`の候補は、ほかのListと同じく保管庫で使われている値だけにする。スニペットに書かれたクラス名は、スニペットの中身を読む必要があって重いので出さない。
- 外した結果、値が空になったら、キーを消すか空のListとして残すかを決める。Tag insert selectorはキーを消している(`delete frontmatter.tags`)ので、それに合わせてキーを消す。

### Tag insert selectorから共通にする部分

- 新しい値の行を作る処理(`src/tags/tagSuggestions.ts`の`buildTagSuggestions`の`type: "new"`)を、タグに依存しない形に切り出す。タグは`#`を外す・空白を許さないなどの正規化があるので、正規化は呼び出し側から渡す。
- 書き込みと失敗の数え方(`src/tags/insertTags.ts`の`insertTags`、`removeTag`)を、キーを受け取る汎用の関数にする。最初は1ノートだけだが、後で複数ノートへ広げるときにそのまま使えるよう、ファイルの配列を受け取る形を保つ。
- 最近使った値(`RecentTagStore`)は、最初は入れない。

## Property value input(Text・Number・Date・Date & time)

入力欄に値を打ち、Enterで書き込む。既存の`SelectionModal`の上に作り、入力欄を値の入力として使う。

- Enterで確定、Escで破棄する。破棄の確認は出さない。失うのは打ちかけの値1つだけで、確認を挟むほうが手間になるため。元の値はヘルプと確定の行の2行目(「Current: …」)に出し、破棄すると何が残るかがわかるようにする。
- 開いたときは、今の値を入力欄に入れて全選択しておく。
- 候補には`getFrontmatterPropertyValuesForKey(key)`の値を出す(Textで同じ値を使い回すことが多いため)。候補を選ぶとその値で書き込む。
- 入力をそのまま確定する行(「Set to "…"」)を先頭に出す。
- 空のまま確定したら、値を空にする(キーは残す)。キーを消すのは一覧の右クリックの「Delete property」で行う。
- 入力の確かめ:

| 型          | 受け付ける入力               | 書き込む値 |
| ----------- | ---------------------------- | ---------- |
| Text        | 何でも                       | 文字列     |
| Number      | 数値として読めるもの         | 数値       |
| Date        | `YYYY-MM-DD`                 | 文字列     |
| Date & time | `YYYY-MM-DDTHH:mm`(秒は任意) | 文字列     |

- 受け付けない入力では確定の行を出さず、理由を2行目に出す。
- Dateでは、`today`・`tomorrow`などの言葉から日付を作る機能は、最初は入れない。

## 一覧の右クリック

| 操作               | 対象                                                 |
| ------------------ | ---------------------------------------------------- |
| Edit               | すべて(Enterと同じ)                                  |
| Delete property    | 現在のノートにあるキー                               |
| Copy value         | 現在のノートにあるキー。Listは改行区切りでコピーする |
| Copy property name | すべて                                               |

- キー名の変更は、保管庫全体のノートに関わるので入れない(Properties viewの「Rename」に任せる)。

## 書き込みで気を付けること

- **書き込みは`processFrontMatter`だけ**: ファイルの文字列を直接書き換えない。
- **フロントマター全体が書き直される**: `processFrontMatter`はフロントマターを読み直して全体を保存するので、YAMLのコメントや書式は消える。Tag insert selectorでも同じなので受け入れる。
- **リンクの値**: `"[[note]]"`のような値が、書き直しで`- - note`という入れ子のリストになった報告がある([obsidian-draft-bench#7](https://github.com/banisterious/obsidian-draft-bench/issues/7))。Paletteが書く値は常に文字列にし、触らないキーの値は変えない。リンクの値を持つノートを書き込んだあとのYAMLを、E2Eで確かめる。
- **失敗**: YAMLが壊れているノートでは例外になる。「Could not update the properties of <note>. See the console.」と通知し、コンソールに詳細を出す。
- **書き込み後の一覧**: メタデータのキャッシュは書き込みの直後には更新されていない。`metadataCache`の`changed`を待ってから一覧を作り直すか、書いた値で一覧を先に直す。Tag insert selectorの`removal`のあとの更新と同じ方法を使う。

## 触る場所

| ファイル                                                      | 変更                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/palette/modes.ts`                                        | `properties`を足す。Homeでの並びはSnippetsのあと                                                             |
| `src/palette/results.ts`                                      | `PropertyResult`(`mode: "property"`、キー、型、値、見出し、ノートにあるか)と、新しいプロパティの行の型を足す |
| `src/search/property/PropertyProvider.ts`                     | 新規。一覧を作る。非公式APIを読む関数もここに置く                                                            |
| `src/properties/`                                             | 新規。型の判定、書き込み、Property value selector、Property value input                                      |
| `src/palette/executePaletteResult.ts`                         | Enterで型ごとの編集を始める分岐                                                                              |
| `src/palette/actions/resultContextMenu.ts`                    | 右クリックの操作                                                                                             |
| `src/ui/MultiSelectModal.ts`、Tag insert・MOC insert selector | 付け外しを揃える(「Selectorの付け外しを揃える」の表)                                                         |
| `src/tags/tagSuggestions.ts`、`src/tags/insertTags.ts`        | 共通にする部分を切り出す                                                                                     |
| `src/settings/model.ts`                                       | `modes`の既定値に`properties`(`pr`)を足す                                                                    |
| `src/ui/hotkeys.ts`                                           | Property value selectorのショートカットの範囲を足す                                                          |
| `docs/GLOSSARY.md`、`README.md`、`README.ja.md`               | 用語と説明                                                                                                   |

## 進め方

1. GLOSSARYにモード名、エイリアス、Selectorの名前を足す。
2. 一覧: `PropertyProvider`と見出し(This note、Reserved、Vault)。型の判定を単体テストにする。この段階ではEnterで何もしない。
3. `tags`をTag insert selectorに回す。Checkboxの切り替え。
4. Selectorの付け外しを揃える(`MultiSelectModal`、Tag insert selector、MOC insert selector)。Propertiesとは別のコミットにする。
5. Property value selector。Tag insert selectorから共通の部分を切り出し、Tag insert selectorの動きが変わらないことをテストで確かめる。
6. Property value input。
7. 右クリックの操作(Delete property、Copy value、Copy property name)。
8. 新しいプロパティの行。
9. README、README.ja。

2〜6で、単体テスト(Vitest)とE2Eを足す。E2Eでは、書き込み後のノートのフロントマターを読んで確かめる。リンクの値と、型が決まっていないキーの例を用意する。

## 後で考えること

- Notesの結果を複数選んで、まとめてプロパティを付ける(Tag insert selectorの複数ノートと同じ形)。
- 最近使った値を候補の先頭に出す。
- 値で検索する(`status: done`のノートを探す)。これは編集ではなく検索なので、Notesモードの絞り込みとして別に考える。

## 参考

- [プロパティ - Obsidian ヘルプ](https://obsidian.md/ja/help/properties)
- [processFrontMatter - Obsidian Developer Docs](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter)
- 似たプラグイン: [Obsidian State Switcher](https://community.obsidian.md/plugins/obsidian-state-switcher)(コマンドからListに値を足す・外す。4年更新なし)、[YAML Creator](https://www.obsidianstats.com/plugins/yaml-creator)、[Property Panels](https://community.obsidian.md/plugins/property-panels)、[Metadata Menu](https://github.com/mdelobelle/metadatamenu)
