# ノートとファイルの操作

パレットからの操作と Obsidian CLI は、機能ごとの実行処理と変換処理を使う。CLI は `obsidian my-palette` で登録済み API と引数を JSON で一覧できる。`obsidian` は起動中の Obsidian に接続するため、プラグインをビルドしただけでは実行中のプラグインには反映されない。

| 操作                     | 処理の所在                                                                                                             | CLI                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 名前変更                 | [renamePlan.ts](../src/rename/renamePlan.ts)、[renameFiles.ts](../src/rename/renameFiles.ts)                           | `rename`                                     |
| フォルダーへ移動         | [moveFiles.ts](../src/palette/moveFiles.ts)                                                                            | `move`                                       |
| ノートをゴミ箱へ移動     | [trashNotes.ts](../src/palette/trashNotes.ts)                                                                          | `trash-notes`                                |
| 統合                     | [mergeNotes.ts](../src/merge/mergeNotes.ts)、[mergeText.ts](../src/merge/mergeText.ts)                                 | `merge-notes`                                |
| フロントマターのタグ     | [tagOperations.ts](../src/tags/tagOperations.ts)                                                                       | `edit-tags`                                  |
| リスト型プロパティ       | [listPropertyOperations.ts](../src/properties/listPropertyOperations.ts)                                               | `edit-list-property`                         |
| MOC の Relateds のリンク | [mocRelatedsCore.ts](../src/moc-relateds/mocRelatedsCore.ts)、[mocOperations.ts](../src/moc-relateds/mocOperations.ts) | `insert-moc-relateds`、`remove-moc-relateds` |
| Vault 監査               | [auditActions.ts](../src/audit/auditActions.ts)                                                                        | `audit`                                      |

パレットのファイル対象は [resultFile.ts](../src/palette/actions/resultFile.ts) で解決・重複除去する。画面の組み立ては [resultContextMenu.ts](../src/palette/actions/resultContextMenu.ts)、CLI の登録は [registerCli.ts](../src/app/registerCli.ts)、対象と計画の検証は [cliPlans.ts](../src/app/cliPlans.ts) にある。操作ごとに対象条件が異なるため、共通の対象収集後もそれぞれの条件を確認する。

## CLI の共通手順

`audit` を除く上記 API は、Vault の相対パスを `paths` に JSON の文字列配列として明示する。対象に存在しないファイルがあるとエラーになり、重複したパスは一度だけ処理する。既定はプレビューで、`apply` は何も変更しないプレビューが返した `plan` の値と一緒に指定する。実行時には計画を作り直し、ハッシュが一致しなければ実行しない。

```powershell
# プレビューを確認し、返された plan を控える。
obsidian my-palette:rename 'paths=["Notes/a_old.md","Notes/b_old.md"]' 'rule=old/new'

# 同じ引数と、確認したプレビューの plan を指定する。
obsidian my-palette:rename 'paths=["Notes/a_old.md","Notes/b_old.md"]' 'rule=old/new' apply 'plan=<プレビューの plan>'
```

`blocked` があるプレビューでは、その値と各項目を確認する。ハッシュは内容が同じ計画かを照合するもので、権限や承認を表すものではない。`items`・`files`・`links` の結果は操作ごとに異なるため、個々の `result` と `reason` を確認する。統合では `merged`・`trashed`・`retargeted`・`failures` を確認する。

一括処理はトランザクションではない。途中で失敗しても成功済みの変更は残る。再試行するときは現在の状態から対象を選び直し、再度プレビューする。計画の確認から書き込みまでの間に別の操作が入る可能性があり、複数ノートをまとめてロックするものではない。

## 操作ごとの条件

- `rename`: `rule` は `検索/置換`。拡張子を除く名前が対象。既存名と衝突する、または変更後の名前が重複する行があれば実行しない。`regex`、`ignore-case`、`first` を指定できる。
- `move`: `folder` に Vault 相対フォルダーパスを指定する。Vault のルートは `/`。同名のファイルが移動先にある、または複数の対象が同じ名前になると実行しない。パレットは除外ノートの取り込みにも対応するが、CLI は索引済みファイルが対象。
- `trash-notes`: Markdown ノートだけが対象。プレビュー後に内容が変わった場合は計画が一致しない。ゴミ箱の保存先は Obsidian の設定に従う。パレットの通常の削除は Notes の結果に限定され、監査画面の削除は監査独自の再確認と MOC リンク解除を行う。
- `merge-notes`: `target` と統合元の `paths` は異なる Markdown ノートにする。プレビューにはプロパティの衝突とリンク付け替え先を含む。統合先のプロパティ・本文、リンク、統合元のゴミ箱移動は別段階なので、失敗時は `failures` を確認する。リンク元の検出には Obsidian のメタデータキャッシュを使う。
- `edit-tags`: `add` と `remove` はタグ名の JSON 配列。フロントマターの `tags` を対象とし、本文中のインラインタグは変更しない。同じタグを追加と削除の両方に指定できない。プレビューには変更前後を含む。保管庫全体のタグ名変更・削除は別機能であり、この CLI の対象ではない。
- `edit-list-property`: `key` と `add`・`remove` の文字列配列を指定する。既存の値が文字列のリスト、または存在しない場合だけ扱う。リストが空になるとキーを削除し、プレビューに `deleteKey` を示す。`tags` は `edit-tags` を使う。テキスト・数値・日付などの編集には対応しない。
- `insert-moc-relateds` / `remove-moc-relateds`: `moc` に MOC、`paths` に対象ノートを指定する。既定は相互リンク、`one-way` では MOC から対象へのリンクだけを操作する。各リンクの方向と状態、各ノートの変更予定を確認できる。いずれかのリンクが操作できない計画は `blocked` になり、実行しない。削除時は子項目のあるリンクを残す。
- `audit`: `kind` と任意の `glob` で一覧を取得する。`trash` は `glob` が必須。監査結果に対する実行時の再確認と、各項目の処理結果は [auditCli.ts](../src/audit/auditCli.ts) を参照する。
