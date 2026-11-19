# プルリクエストを作成する

## プルリクエスト

変更を GitHub にプッシュしたので、Open Pixel Art プロジェクトに取り込んでもらいましょう！

プルリクエストは、変更を取り込むようリポジトリの所有者に依頼する手段です。最初に、取り込み先の `base` を指定します。次に、元のリポジトリと比較するため、プッシュしたブランチを `compare` に選びます。

## プルリクエストの設定

GitHub には[フォークから画面上でプルリクエストを作成する手順](https://help.github.com/en/articles/creating-a-pull-request-from-a-fork)があります。

`open-pixel-art` プロジェクトの `master` ブランチを取り込み先として選びます。このブランチがプルリクエストの base になります。

変更元のリポジトリ（head）として自分のフォークを選びます。比較対象のブランチ（compare）には、自分で作成した <%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %> を選びます。

次の URL を開くと、`base` と `compare` を設定した状態で GitHub のプルリクエスト作成画面に移動できます。

[https://github.com/twilio-labs/open-pixel-art/compare/master...<%= env.TQ_GITHUB_USERNAME.value %>:<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>](https://github.com/twilio-labs/open-pixel-art/compare/master...<%= env.TQ_GITHUB_USERNAME.value %>:<%= env.TQ_OPEN_PIXEL_ART_BRANCH.value %>)

## プルリクエストを作成する

設定を確認したら、大きな `Create Pull Request` ボタンをクリックします。タイトルと本文を入力できるフォームが開きます。

本文にはひな形が入っています。提案する変更に合わせて編集できます。本文の書式は [Markdown のガイド](https://guides.github.com/features/mastering-markdown/)で詳しく学べます。

今後貢献するリポジトリでも、用意されたひな形を見かけることがあります。Open Pixel Art のひな形には、作成前に確認する項目のチェックリストがあります。

ピクセルを追加したときに条件を満たしているはずですが、ここで改めて確認しましょう。GitHub の Markdown では、`- [ ]` がチェックボックスになります。チェックを付けるには、角括弧の間の空白を `x` に置き換え、`- [x]` と書きます。

すべて確認したら、`Create Pull Request` ボタンをクリックしてください！

## プルリクエストの番号

GitHub で作成したプルリクエストには、後で参照できるようそれぞれ番号が付けられます。番号は画面上のタイトルの横と、プルリクエストの URL の末尾にあります。

```bash
https://github.com/twilio-labs/open-pixel-art/pull/<PULL_REQUEST_NUMBER>
```

プルリクエストを見失っても、[GitHub で自分が作成したプルリクエストの一覧](https://github.com/pulls)を確認できます。

## ハックしよう

右の入力欄にプルリクエストの番号を入力し、`HACK` をクリックして課題を終えましょう！
