# 目標のヘルプ

まずは[コンピューターに Node.js をインストール](https://www.nodejs.org)してください。このツールを使って、これから書く JavaScript コードを実行します。

## Node.js ランタイムのフルパスを調べる

Node.js をインストールすると、コマンドラインで `node` と `npm` が使えるようになります。Mac と Linux では、ターミナルで次のコマンドを実行して Node.js のフルパスを確認できます。

```bash
which node
```

Windows の PowerShell では、次のコマンドを使います。

```bash
Get-Command node.exe | Select-Object -ExpandProperty Definition
```

フルパスを右の入力欄に貼り付け、*ハック*をクリックしてください。
