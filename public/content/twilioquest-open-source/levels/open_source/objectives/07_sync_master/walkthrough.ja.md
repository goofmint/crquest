# フォークを同期する

## Git は分散型のシステム

Git の重要な特徴の一つは分散型であることです。分散型のシステムには、もともと決まった「上流」や「下流」はありません。

各リポジトリは、Git の履歴とコードのスナップショットをそれぞれ持ちます。オープンソースのコミュニティでは、整理しやすいよういくつかの命名規則を使っていますが、名前に特別な機能があるわけではありません。

## ローカルとリモート

まず、`local` と `remote` を区別しましょう。自分のコンピューターにクローンしたものが `local`（ローカル）リポジトリです。GitHub 上の元のリポジトリとそのフォークが `remote`（リモート）リポジトリです。

変更をフォークにプッシュするまでは、自分のローカルリポジトリにだけ変更があります。オープンソースプロジェクトでは、その間にもほかの開発者が変更をプッシュしています。

## ほかの開発者の変更を取り込むには？

作業中に、ローカルにはない変更が GitHub に追加されたかもしれません。Open Pixel Art のフォークをコンピューターにクローンした時点で、フォークがリモートとして登録されています。

登録済みのリポジトリは `git remote` コマンドで確認できます。`-v` を付けると、接続先リポジトリの URL など、詳しい情報が表示されます。

```bash
git remote  -v
```

`git remote` を実行すると、次のような行が表示されます。

```bash
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (fetch)
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (push)
```

ほかの開発者の変更先は、自分のフォークではなく元のリポジトリです。もう一つリモートリポジトリを登録しましょう。慣例により、`upstream` と名付けます。

## upstream リモートを登録するには？

まず、[元の Open Pixel Art プロジェクト](https://github.com/twilio-labs/open-pixel-art)の git リポジトリの URL が必要です。ブラウザーで見る URL に似ていますが、末尾が `.git` になります。前に[GitHub のドキュメントに沿ってクローンした](https://help.github.com/en/articles/cloning-a-repository)ときと同じ方法で取得できます。

このリポジトリの URL は次のとおりです。今後、ほかのリポジトリを扱うときは、その URL を使ってください。

```bash
https://github.com/twilio-labs/open-pixel-art.git
```

次に `git remote` の `add` を使います。実行するコマンドは次のとおりです。

```bash
git remote add upstream https://github.com/twilio-labs/open-pixel-art.git
```

`git remote add` が実行するコマンド、`upstream` が登録するリモートの名前です。`https://github.com/twilio-labs/open-pixel-art.git` は GitHub にある Open Pixel Art リポジトリの URL です。

もう一度 `git remote -v` を実行し、`upstream` を正しく登録できたことを確認します。今度は `origin` と `upstream` の両方が表示されるはずです。

```bash
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (fetch)
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (push)
upstream	https://github.com/twilio-labs/open-pixel-art.git (fetch)
upstream	https://github.com/twilio-labs/open-pixel-art.git (push)
```

## フォークとリモートを同期する

ここでは、2つのリモートリポジトリを直接同期する代わりに、ローカルリポジトリを経由して同期します。

1. 元の Open Pixel Art リポジトリの `master` ブランチから、コードをローカルに取り込みます。
2. ローカルリポジトリの `master` ブランチにマージします。
3. 更新された `master` ブランチを自分のフォークにプッシュします。

これで3つのリポジトリが同期されます。

**1.** まず、ローカルの master ブランチに切り替えます。

```bash
git checkout master
```

master に切り替えると、コードは当初クローンした時点の状態に戻ります。`_data/pixels.json` を見ると、自分で追加したピクセルは表示されません。

自分のブランチ `<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>` に切り替えると、加えた変更を確認できます。

**2.** `git pull` コマンドで、先ほど登録した `upstream` リポジトリのコードを取り込みます。取り込み元として `master` ブランチも指定します。

```bash
git pull upstream master
```

**3.** pull を実行すると、ローカルの `master` と `open-pixel-art` の `master` の差分が表示されます。多数のファイルが表示される場合もあれば、すでに最新だと表示される場合もあります。

pull ですでに最新だと表示された場合も、git push コマンドでローカルの変更を自分のフォークに反映します。前回の pull が成功し、push だけが失敗していた場合にも必要です。

```bash
git push
```

ローカルの `master` の変更がフォークの `master` に送られます。これでフォーク、ローカル、open-pixel-art の master ブランチの履歴が同期されました！

## 同期を確認しよう

次の URL で、各リポジトリの最新コミットを確認できます。ページを更新してから、フォークと元のリポジトリの最新コミットが同じか確かめてください。

同期した後に新しいコミットが追加されていることもあります。この練習用リポジトリではプルリクエストが自動で承認・マージされるので、特によく起こります。

[https://github.com/twilio-labs/open-pixel-art/commits/master](https://github.com/twilio-labs/open-pixel-art/commits/master)

[https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art/commits/master](https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art/commits/master)

3つのリポジトリの master ブランチを同期できたら、右の `HACK` を押してください！
