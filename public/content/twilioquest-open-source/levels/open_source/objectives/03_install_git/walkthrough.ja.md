<% const isWindows = context.systemInfo.os === 'win32'; %>

# Git のインストール

## Git とは？

Git はバージョン管理ソフトウェアの一種です。コードベースに加えた変更の履歴を管理するので、ほかの開発者と協力できます。

各変更は、その時点のコードのスナップショットとして Git に記録されます。Git ではこれを「コミット」と呼びます。コミットの一覧はローカルのコンピューターと GitHub などのリモートサーバーで共有され、権限のある人なら `git` を使って変更履歴を確認できます。

迷路の中心に着いたら、最初のローカルコミットを作ります！

## インストールの手順

Git はコマンドラインツールです。macOS の Terminal や Windows の PowerShell などの開き方を確認しておきましょう。

GitHub Desktop など、コマンドラインの Git をグラフィカルな画面から使えるツールもあります。多くの用途で役に立ちます。

このミッションではコマンドラインの `git` を使います。Git のウェブサイトに、さまざまな OS 向けの[インストール手順](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)があります。手順に沿って進めてください。

コマンドラインが使いづらければ、このミッションの後で GitHub Desktop も試してみましょう。

## ハックしよう

[Git 公式のインストール手順](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)に従ってください。完了したらターミナルで次のコマンドを実行し、`git` が正しく入ったことを確認します。

```
git --version
```

Git が正しくインストールされていれば、次のように表示されます。

```
git version 2.22.0
```

次に、コンピューターにインストールされた `git` コマンドの**完全なパス**を調べます。`<%= isWindows ? "PowerShell" : "Terminal" %>` で次のコマンドを実行すると、`git` のインストール先のパスが表示されます。

<% if(isWindows) { %>

```bash
Get-Command git.exe | Select-Object -ExpandProperty Definition
```

<% } else { %>

```bash
which git
```

<% } %>

`git` の**完全なパス**を確認したら、右の入力欄に貼り付けて `HACK` をクリックしてください。
