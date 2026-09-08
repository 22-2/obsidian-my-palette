- [x] 無駄な部分を削ぎ落としてシンプルにミニマルに（バツとか上の余白とか）
- [x] ctrl+shift+pでコマンドリストを開く（最初から> prefix）, ctrl+pでファイルリストを開く
- [x] 設定画面整理（用途別ページに分割） -> https://docs.obsidian.md/plugins/guides/migrate-declarative-settings, https://docs.obsidian.md/Plugins/User+interface/Settings
- [x] プロバイダをインターフェイスでくくる
- [x] scが今何のノートを開いてたか忘れてしまうのでどこかに表示 -> サジェストにステータスバーとか出したほうが良いかな
- [x] リスト項目のミドルクリック（新しいタブをバックグラウンドで開く）、右クリックメニュー（メニューを表示）を実装してほしいっす
- [ ] 高頻度ソートキー
[Omniboxソート実装比較 - ChatGPT](https://chatgpt.com/c/6a962385-2a00-83ee-85fe-a91c67d438d6)

- [ ] 表示されているノートを一括コピーがほしいな
ファイル名のみ、フルパス、相対パスとか
いっそリストボックスに選択の概念を作ってしまったほうが楽、というかシンプルに実装できるかもしれない🤔
クリックで選択、ダブルクリックで開く、Enterは普通に開く、右クリックでメニュー
windowsのファイルエクスプローラみたいにCtrlで選択保持、Shiftで範囲選択みたいな
範囲選択したときに、右クリックで特殊メニューを表示みたいな
@zag-js/listbox @zag-js/vanillaが使えるっすかね🤔
src\ui\baseSuggestModal.ts
これをそのままいじくるべきか？
それともこれを継承したbaseをつくるべきか？

- [ ] 任意のプロパティも検索する（わたしがやりたいのはkeywords[]string）

## 名前

CodeLike|Pragmatic (Command Palette|Switcher)
