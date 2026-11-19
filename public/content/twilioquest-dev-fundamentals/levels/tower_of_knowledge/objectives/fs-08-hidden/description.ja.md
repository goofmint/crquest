<% const isWindows = context.systemInfo.os === 'win32'; %>

# 隠しファイルを作る

<div class="aside">
<h3>達成条件</h3>
<ul>
<% if(isWindows) { %>
  <li>前に作ったディレクトリに、<b>ni</b> で「sneaky.txt」を作ります。</li>
  <li><b>attrib +h</b> で隠し属性を付けます。</li>
<% } else { %>
  <li>前に作ったディレクトリに、<b>touch</b> で隠しファイル「.sneaky.txt」を作ります。</li>
<% } %>
  <li>作成したら <em>HACK</em> を押します。</li>
</ul>
</div>

隠しファイルを作ってみましょう。

<% if(isWindows) { %>

`ni` でファイルを作成し、`attrib` で隠し属性を設定します。これまでと同じように `ni` の後ろにファイル名を指定します。例は `ni yourfilename.txt` です。そのあと、`attrib` に `+h` フラグを付け、`attrib +h yourfilename.txt` のように実行します。

`spoon.txt` というファイルを作り、隠し属性を設定する例です。作業前後に `ls` へ `-ah` フラグを付けて実行し、ファイルを確認します。

```bash
$ ls -ah
*should not show anything*

$ ni spoon.txt
$ attrib +h spoon.txt

$ ls -ah
spoon.txt
```

`ni` を使い、ファイル名は英語で `sneaky.txt` と入力してください。作成後に `attrib +h` で隠し属性を付けます。

隠しファイルを作成したら、_HACK_ を押してください。

<% } else { %>

今回は `touch` でファイルを作ると同時に隠しファイルにします。これまでと同じようにコマンドの後ろにファイル名を指定し、ファイル名の先頭にピリオドを付けます。例えば `touch .yourfilename` です。

`.spoon.txt` という隠しファイルを作成する例です。作業前後に `ls` へ `-a` フラグを付けて実行し、ファイルを確認します。

```bash
$ ls -a
*should not show anything*

$ touch .spoon.txt

$ ls -a
.spoon.txt
```

`touch` を使い、隠しファイル名は英語で `.sneaky.txt` と入力してください。

隠しファイルを作成したら、_HACK_ を押してください。

<% } %>
