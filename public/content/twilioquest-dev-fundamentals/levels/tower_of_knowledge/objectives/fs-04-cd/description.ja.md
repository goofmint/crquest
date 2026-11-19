<% const isWindows = context.systemInfo.os === 'win32'; %>

# ディレクトリ間を移動する

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>下のファイルツリーを確認します。</li>
  <li>ケース 1 で作業ディレクトリがどこになるかを考えます。</li>
  <li>ケース 2 で作業ディレクトリがどこになるかを考えます。</li>
  <li>それぞれのパスを右側の入力欄に入力します。</li>
  <li>入力したら <em>HACK</em> を押します。</li>
</ul>
</div>

ファイルシステムの中身が分かったところで、ディレクトリ間を移動する方法を学びましょう。

セドリックのコンピューターを使って、ディレクトリ間の移動を考えます。ファイルツリーをもう一度確認してください。

```plaintext
cedric/
├── robot_thoughts/
│ ├── real_boy.idea
│ └── youtube_video.mp4
│
├── thank_you_drafts/
│ ├── thank_you_toast.docx
│ ├── thank_you_toast_v1.docx
│ ├── thank_you_toast_v2.docx
│ └── thank_you_toast_v2_Final.docx
│
├── fog_owl_computations.csv
└── my_cool_drawing.png
```

**次の二つのケース** を考えてください。

1. ルートディレクトリ cedric から `robot_thoughts` に移動したとき、作業ディレクトリはどこになりますか？

2. ルートディレクトリ cedric から `fog_owl_computations.csv` に移動しようとしたとき、作業ディレクトリはどこになりますか？

それぞれの作業ディレクトリのパスを、図にある英語の名前のまま右側の入力欄に入力し、_HACK_ を押してください。

## ディレクトリを移動するには？

<% if(isWindows) { %>

ファイルシステムに関する三つ目のコマンドは `cd` です。「change directory（ディレクトリの変更）」の略で、ターミナルの作業ディレクトリを切り替えます。

ターミナルで `cd` に続けてディレクトリ名を入力すると、そのディレクトリに移動します。そのあとで `pwd` を実行すると、移動先が表示されます。

セドリックのファイルシステムで `cd` を使う例を見てみましょう。

```bash
$ pwd
Path
----
cedric

$ cd thank_you_drafts

$ pwd
Path
----
cedric/thank_you_drafts
```

> ⚠️ 移動できるのはディレクトリです。ファイルに対して `cd` を実行しても、現在の作業ディレクトリは変わりません。

<% } else { %>

ファイルシステムに関する三つ目のコマンドは `cd` です。「change directory（ディレクトリの変更）」の略で、ターミナルの作業ディレクトリを切り替えます。

ターミナルで `cd` に続けてディレクトリ名を入力すると、そのディレクトリに移動します。そのあとで `pwd` を実行すると、移動先が表示されます。

セドリックのファイルシステムで `cd` を使う例を見てみましょう。

```bash
$ pwd
cedric

$ cd thank_you_drafts

$ pwd
cedric/thank_you_drafts
```

> ⚠️ 移動できるのはディレクトリです。ファイルに対して `cd` を実行しても、現在の作業ディレクトリは変わりません。

<% } %>
