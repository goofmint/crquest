# JavaScript コードを実行する

この練習では、コンピューターで JavaScript プログラムを作成し、実行する方法を学びます。今回は必要なコードをすべて用意しました。以降の課題では、自分でコードを書くことが増えていきます。

<details>
<summary>手順 1：JavaScript ファイルを作る</summary>

TwilioQuest 用の作業フォルダーに `sayPlease.js` という新しいファイルを作ります。フォルダーの場所は次のとおりです。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

**拡張子**（ここでは `.js` の部分）は、ファイルの種類を示します。音声ファイルなら `.mp3`、Microsoft Word の文書なら `.docx`、JavaScript ファイルなら通常は `.js` です。

あとで JavaScript を実行するためにもターミナルを使うので、ここでファイルを作成するのにも便利です。

Mac や Linux の場合はターミナルで次のコマンドを使います。

```bash
cd "<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>"
touch sayPlease.js
```

Windows の PowerShell では、次のコマンドを使います。

```bash
cd "<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>"
New-Item sayPlease.js
```

</details>

<details>
<summary>手順 2：ファイルを開き、コードを書く</summary>

JavaScript ファイルを作ったら、コードを入れましょう。Photoshop で画像を編集するように、コードの編集にも専用のソフトウェアが便利です。こうしたツールを**統合開発環境（IDE）**や**テキストエディター**と呼びます。

まだ用意していなければ、[Visual Studio Code](https://code.visualstudio.com/) を試せます。比較的軽快で、基本機能もそろっています。慣れれば複雑な作業にも使えます。

VS Code または好みのエディターで `sayPlease.js` を開いてください。最初はおそらく空です。

この課題は、下のコードをそのまま貼り付ければ完了できます。今は意味が分からなくても大丈夫です。JavaScript の組み込み関数 `console.log` を使い、ターミナルに英語のテキストを 1 行出力します。

```js
console.log('Glen, will you please open the barrier?');
```

コードを追加したら、**変更を保存してください**。これでコードを実行し、結果を確認できます。

</details>

<details>
<summary>手順 3：コードを実行して確認する</summary>

インストールした Node.js ランタイムで `sayPlease.js` のコードを実行します。通常はコンピューターのコマンドラインアプリを使います。Mac なら Terminal.app、Windows なら PowerShell です。

ターミナルを開き、次のコマンドを実行して、現在の作業ディレクトリーを `sayPlease.js` を作ったフォルダーに変更します。

```bash
cd "<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>"
```

次に、`node` コマンドで JavaScript コードを実行します。

```bash
node sayPlease.js
```

このコマンドで、グレンへの丁寧な依頼がコンソールに出力されます。

</details>

TwilioQuest の各所で、今回のようにファイルを作成、編集、実行することになります。

`sayPlease.js` を実行して必要なメッセージを出力できたら、*ハック*をクリックして IT 部門へ依頼しましょう。
