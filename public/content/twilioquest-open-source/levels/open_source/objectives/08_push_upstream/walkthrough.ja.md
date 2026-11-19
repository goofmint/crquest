# リモートにプッシュする

## ローカルとリモート

Git リポジトリは、置き場所で2種類に分けられます。自分のコンピューターにクローンしたものは `local`（ローカル）リポジトリです。GitHub にある元のプロジェクトと自分でフォークしたコピーは、`remote`（リモート）リポジトリです。

現時点では、追加したピクセルは自分のコンピューター上のローカルリポジトリにしかありません。公開するには、リモートリポジトリへ送る必要があります。

`git push` コマンドを使います。実行する前に、いくつかの引数やフラグを指定しましょう。

## 上流ブランチ

ローカルの変更をリモートリポジトリに送ることを、Git ではプッシュと呼びます。「上流」は、ローカルで作業しているブランチに対応するリモート側のブランチを指します。この課題では同じ名前を使います。

先ほど `git branch` コマンドで作ったブランチは、ローカルにしかありません。プッシュするときに `--set-upstream` フラグを指定して、リモートにもブランチを作り、そのブランチを上流として設定します。

ここまでのコマンドは次のとおりです。

```bash
git push --set-upstream
```

## プッシュ先は origin

まず `--set-upstream` フラグを指定しました。次は、どのリモートリポジトリを使うか調べます。ターミナルで次のコマンドを実行してください。

```bash
git remote  -v
```

次のような行が表示されます。

```bash
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (fetch)
origin	https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git (push)
```

表示された URL は、最初に Open Pixel Art のフォークをローカルにクローンしたときと同じです。`git` がフォークをリモートとして登録しました。

URL の左には `origin` とあります。Git が最初にクローンしたリモートに付ける既定の名前です。

`origin` リモートにプッシュするには、`--set-upstream` フラグの後にその名前を引数として指定します。

ここまでのコマンドは次のとおりです。

```bash
git push --set-upstream origin
```

## ブランチ名を指定する

最後に Git に伝えるのはブランチの名前です。リモート側にも、ローカルで作業しているブランチと同じ名前を付けます。

`git push` コマンドの最後の引数に、作業してきたローカルブランチの名前を渡します。

最終的なコマンドは次のとおりです。

```bash
git push --set-upstream origin <%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>
```

コマンドを実行しましょう。GitHub に認証を求められた場合は、使っている認証方法に従ってください。認証が済むと変更が GitHub に反映されます。

## 確認しよう

GitHub で自分のリポジトリを開き、ブランチがあることを確認します。

新しいブランチの URL は次のような形です。

[https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art/tree/<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>](https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art/tree/<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>)

GitHub の画面から選ぶこともできます。URL を暗記する必要はありません。

## ハックしよう

ローカルブランチをリモートのフォークにプッシュしたら、`HACK` を押してください！
