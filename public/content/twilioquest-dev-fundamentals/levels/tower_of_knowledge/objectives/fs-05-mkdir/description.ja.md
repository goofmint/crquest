<% const isWindows = context.systemInfo.os === 'win32'; %>

# ディレクトリを作る

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li><b>mkdir</b> で新しいディレクトリを作ります。</li>
  <li>作成したディレクトリへのパスを調べます。</li>
  <li>そのファイルパスを右側の入力欄に入力します。</li>
  <li>入力したら <em>HACK</em> を押します。</li>
</ul>
</div>

既存のディレクトリへ移動できるようになりました。次は自分でディレクトリを作りましょう。

<% if(isWindows) { %>

今回使うのは `mkdir` です。「make directory（ディレクトリの作成）」の略です。ターミナルで `mkdir` に続けて、作りたいディレクトリの名前を入力します。

次は「test_directory」のようなディレクトリを作る例です。作成の前後に `ls` で一覧を表示すると、新しいディレクトリを確認できます。

```bash
$ ls
old_directory

$ mkdir new_directory

$ ls
old_directory new_directory
```

`mkdir` を使って、作業ディレクトリの中に好きな名前でディレクトリを作ってください。次に、作成先へのファイルパスを調べます。以前の課題で使った `cd` や `pwd` が役立ちます。

作ったディレクトリのパスをそのまま右側の入力欄に入力し、_HACK_ を押してください。

<% } else { %>

今回使うのは `mkdir` です。「make directory（ディレクトリの作成）」の略です。ターミナルで `mkdir` に続けて、作りたいディレクトリの名前を入力します。

次は「test_directory」のようなディレクトリを作る例です。作成の前後に `ls` で一覧を表示すると、新しいディレクトリを確認できます。

```bash
$ ls
old_directory

$ mkdir new_directory

$ ls
old_directory new_directory
```

`mkdir` を使って、作業ディレクトリの中に好きな名前でディレクトリを作ってください。次に、作成先へのファイルパスを調べます。以前の課題で使った `cd` や `pwd` が役立ちます。

作ったディレクトリのパスをそのまま右側の入力欄に入力し、_HACK_ を押してください。

<% } %>
