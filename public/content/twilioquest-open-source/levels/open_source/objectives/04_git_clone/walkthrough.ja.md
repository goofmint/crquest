# クローン

## クローンとは？

Git の主な機能の一つは、ほかの人がサーバーに置いているコードを自分のコンピューターにコピーすることです。この操作を「クローン」と呼びます。`git clone` コマンドを使い、GitHub の Open Pixel Art リポジトリのローカルコピーを作ります。

## クローンするには？

Git のコマンドラインツールには `clone` コマンドがあります。このコマンドを使うには、クローンしたいリポジトリの URL が必要です。

GitHub の[リポジトリの URL を取得する手順](https://help.github.com/en/articles/cloning-a-repository)にはクローンの全手順が載っています。ここでも順に確認しましょう。

GitHub で自分の Open Pixel Art のフォークを開き、HTTPS のクローン URL をコピーします。URL は `https://` で始まり、`.git` で終わります。フォークの名前を変更していなければ、次の URL になります。

```
https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git
```

URL がわかったら、ターミナルで `git clone` に続けて URL を入力し、実行します。

```
git clone https://github.com/<%= env.TQ_GITHUB_USERNAME.value %>/open-pixel-art.git
```

これでクローンが始まります！

## ディレクトリを移動する

クローンが完了すると、GitHub にあるファイルと同じ内容のファイルを開けるようになります。

クローンを確認するには、プロジェクトの完全なパスが必要です。`cd` で Git が作成したディレクトリに移動します。クローン先のディレクトリ名が例と異なる場合は、コマンドに実際の名前を指定してください。後の目標で使うため、GitHub 上のフォーク名は `open-pixel-art` にしておいてください。

```
cd open-pixel-art
```

一覧を表示する `ls` コマンド（Windows では `dir`）を実行すると、`package.json` や `README.md` などのファイル名が表示されます。

```
ls
```

## 現在の作業ディレクトリ

ターミナルでクローンしたディレクトリを開けたので、そのパスを取得します。現在の作業ディレクトリを表示する `pwd` コマンドを実行してください。

```
pwd
```

ファイルマネージャーやテキストエディターでこのディレクトリを開いても、Open Pixel Art リポジトリのクローンを確認できます。

## 確認しよう

`pwd` コマンドで表示したクローン先のパスをコピーし、右の入力欄に貼り付けて `HACK` を押してください！
