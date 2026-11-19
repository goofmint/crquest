# マージを使いこなそう

## マージとは？

元の Open Pixel Art リポジトリからローカルにコミットを取り込んだときは、順調に進みました。そのブランチのファイルを自分では変更していなかったためです。

一方、ピクセルのブランチ `<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>` では、新しいピクセルをコミットしています。Open Pixel Art から変更を取り込んだときに、だれかが別のピクセルを追加していたかもしれません。同じコードに影響する変更をまとめるにはマージが必要です。

Git がマージ後のコードを自動で判断できることもあります。たとえば私がファイルの1行目を、あなたが200行目を変更したなら、両方を取り込めます。でも私が3行目を、あなたが5行目を変更した場合は、もっと複雑になります。

Git が結果を自動で判断できない場合は、人が最終的なファイルに含めるコードを選びます。これをマージコンフリクトと呼びます。

## コンフリクトへの対処

マージコンフリクトの解消は簡単とは限りません。Git やバージョン管理の作業で何が苦手かを開発者に聞くと、「マージコンフリクトの解消」という答えをよく耳にします。経験豊富な開発者でも難しいと感じるものです。

今回は `_data/pixels.json` の1行しか変えていないので、比較的簡単に解消できるはずです。

詳しくは GitHub の[マージコンフリクトとその原因についての資料](https://help.github.com/en/articles/about-merge-conflicts)や、[コマンドラインでコンフリクトを解消する手順](https://help.github.com/en/articles/resolving-a-merge-conflict-using-the-command-line)を参照してください。

## マージするには？

まず、ピクセルを追加したブランチに戻ります。`_data/pixels.json` に自分のピクセルが再び表示されます。

```bash
git checkout <%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>
```

このブランチには master の最新コードがまだ入っていません。`master` ブランチを現在のブランチ `<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>` にマージします。

```bash
git merge master
```

マージを実行すると、経過がターミナルに表示されます。自動でマージしようとしたファイルや、コンフリクトが発生したかどうかもわかります。

`CONFLICT` が表示されずにマージが成功した場合は、手動での解消とコミットの手順を飛ばして「確認しよう」に進んでください。

マージの状況については、`git status` コマンドで詳しく確認できます。

手作業で解消する必要がある場合は `You have unmerged paths.` と表示されます。やり直したくなったときにマージを中止できる `git merge --abort` も案内されます。

出力の末尾には、コンフリクトを解消する必要があるパスが一覧で表示されます。ピクセルを1つ追加しただけの場合、次のようになります。

```bash
Unmerged paths:
  (use "git add <file>..." to mark resolution)

	both modified:   _data/pixels.json
```

[コンフリクトを解消しましょう！](https://help.github.com/en/articles/resolving-a-merge-conflict-using-the-command-line)

コンフリクトが発生した場合は、解消後に `git add` で変更をステージし、それからコミットします。Git が自動生成したメッセージを使うため、`-m` は付けません。

## コミットしよう

```
git commit
```

コマンドを実行して `error: Committing is not possible because you have unmerged files.` のようなエラーが出た場合は、マージの問題がまだ解消されていません。

このエラーが出なければ、コミットメッセージを書くためのエディターが開きます。

Git が既定で使う vim は、コマンドラインのテキストエディターです。初めて使う場合は、次の手順でメッセージを保存できます。

1. `ESC` キーを押し、コマンドモードに入ります。
2. `:` を入力してコマンドを開始します。
3. `w` を入力し、変更をファイルに書き込むよう指定します。
4. `q` を入力し、vim を終了するよう指定します。
5. `ENTER` を押してコマンドを実行します。

うまくいけば、vim が閉じてターミナルに戻ります。

## 確認しよう

最後に `git status` を実行し、問題がないか確かめます。`nothing to commit, working tree clean` のように表示されれば、コミットすべき変更は残っていません。

マージコミットが作成された場合は、`git log` で確認します。最新のコミットには、エディターで入力したメッセージか、次のような自動生成メッセージが表示されます。

```bash
Merge branch 'master' into <%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>
```

すでに最新だと表示された場合や、fast-forward でマージが完了した場合は、新しいマージコミットは作成されません。自分のブランチ `<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>` に master の最新コミットが含まれていれば、右の `HACK` を押してください。
