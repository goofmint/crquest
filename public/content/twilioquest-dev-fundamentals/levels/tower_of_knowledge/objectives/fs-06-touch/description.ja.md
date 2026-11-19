<% const isWindows = context.systemInfo.os === 'win32'; %>

# ファイルを作る

<div class="aside">
<h3>達成条件</h3>
<ul>
<% if(isWindows) { %>
  <li><b>ni</b> で新しいファイルを作ります。</li>
<%} else { %>
  <li><b>touch</b> で新しいファイルを作ります。</li>
<% } %>
  <li>ファイルの名前をコピーします。</li>
  <li>右側の入力欄にファイル名を貼り付けます。</li>
  <li>入力したら <em>HACK</em> を押します。</li>
</ul>
</div>

ディレクトリができたので、その中にファイルを作ってみましょう。

<% if(isWindows) { %>

「new item（新しい項目）」を意味する `ni` コマンドでファイルを作れます。`ni` に続けてファイル名を指定します。例えば `ni yourfilename` です。

「cloud」というテキストファイルを作る例を示します。作成の前後に `ls` で一覧を表示すると、ファイルが作られたことを確認できます。

```bash
$ ls
*should not show anything*

$ ni cloud.txt

$ ls
cloud.txt
```

`ni yourfilename` を使って、前の課題で作ったディレクトリに好きな名前でファイルを作り、名前をコピーしてください。以前使った `cd` や `pwd` も活用しましょう。

新しいファイルの名前をそのまま右側の入力欄に入力し、_HACK_ を押してください。

<% } else { %>

コマンドラインで新しいファイルを作る方法はいくつかあります。手軽なのが `touch` です。`touch` にファイル名を続けて `touch yourfilename` のように入力します。`touch` は本来ファイルのアクセス時刻や更新時刻を変更するコマンドですが、指定した名前のファイルがなければ新しく作成します。

「cloud」というテキストファイルを作る例を示します。作成の前後に `ls` で一覧を表示すると、ファイルが作られたことを確認できます。

```bash
$ ls
*should not show anything*

$ touch cloud.txt

$ ls
cloud.txt
```

`touch` を使って、前の課題で作ったディレクトリに好きな名前でファイルを作り、名前をコピーしてください。以前使った `cd` や `pwd` も活用しましょう。

新しいファイルの名前をそのまま右側の入力欄に入力し、_HACK_ を押してください。

<% } %>
