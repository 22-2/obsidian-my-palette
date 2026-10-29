# アイデア: GitHubの連携

計画ではなく、試したいことのメモ。実装するときは、別途計画を立てる。

保管庫がGitHubのリポジトリのとき、リポジトリやノートのGitHubのページをPaletteから開く。EverythingやSmart Connectionsと同じく、Integrationsの1つとして扱い、条件が揃わないときは隠す。

## 当面の扱い

当面は、My Commandsの個別のコマンド(`obsidian-my-commands/docs/QUICK_OPEN_COMMANDS_PLAN.md`)をCommandsモード(`>`)から呼ぶ。Paletteに入れるのは、次の懸念が片付いてから。

## 懸念

- **環境が前提になる**: 保管庫がGitリポジトリで、`origin`がGitHubであることが要る。`gh`を使うなら、それが入っていてログイン済みであることも要る。ほかの利用者の多くには関係がない。
- **Paletteの役目から外れやすい**: Paletteは「検索して開く」UI。決まったページを開くだけの項目は、検索するものがない。
- **独自のコマンド管理にしない**: 「このページも開きたい」を受け入れていくと、ユーザーが外部コマンドを登録する仕組みが要るようになる。それはPaletteではなくコマンドの側(My Commands)でやる。

## やるならこの形

### 1. ノートのGitHubのページを開く操作

ファイル結果の操作([開き方の計画](plan/PLUGINS_SNIPPETS_AND_OPEN_WITH_PLAN.md))に「Open on GitHub」を足す。どのモードのファイル結果にも効くので、Paletteの作りに合う。

- URLは`origin`のURL、現在のブランチ、保管庫ルートからの相対パスから組み立てる(`https://github.com/<owner>/<repo>/blob/<branch>/<path>`)。`gh browse <path>`を呼ぶより、`gh`が要らない分だけ条件が軽い。
- ブランチがリモートにない、ファイルがコミットされていない場合は、開いても404になる。操作は出したままにし、開く前に確かめるかどうかは試して決める。

### 2. GitHubモード

入力すると、リポジトリのページを候補に出すモード。

- 固定の候補: Repository、Issues、Pull requests、Discussions、Actions、New issue。
- 検索の候補: `gh issue list --json number,title,url`、`gh pr list --json …`の結果を、Issue・PRとして検索できるようにする。ここまで来ると「検索して開く」になり、モードにする意味が出る。
- 固定の候補だけならモードにする価値は薄い。Issue・PRの検索まで作るときに、モードとして足す。

### 3. 連携の設定

- Integrationsに「GitHub」を足す。有効・無効と、`gh`のパス(要るなら)を持つ。
- 準備できているかの判定(`IntegrationReadiness`)は、`origin`がGitHubであることと、`gh`を使う機能では`gh auth status`が通ることを見る。

## 調べること

- Obsidianのプラグインから、Gitのブランチと`origin`のURLを読む軽い方法(`.git/HEAD`と`.git/config`を読むか、`git`を起動するか)。My Commandsの`ensureGitManager(...).getRemoteUrl("origin")`が何を使っているか。
- `gh`の起動にかかる時間。モードを開くたびに呼ぶなら、結果をしばらく覚えておく必要がある。
