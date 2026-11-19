<% const isWindows = context.systemInfo.os === 'win32'; %>

# ファイルパスを探す

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>下のファイルツリーを確認します。</li>
  <li>該当するファイルのパスを右側の入力欄に入力します。</li>
  <li>入力したら <em>HACK</em> を押します。</li>
</ul>
</div>

セドリックは YouTube チャンネルを始めようとしています。撮影した動画をどこに保存したのか、探してあげましょう。

下の図はセドリックのコンピューターにあるファイルとフォルダーの一部です。動画ファイルへのパスを探してください。

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

パスの書き方は、次の例を参考にしてください。

- セドリックがフォグ・オウル号の飛行計算を保存したファイルのパス
  <%= `\`${formatPathPartsForOs('cedric', 'fog_owl_computations.csv')}\`` %>
- セドリックがお礼のスピーチの最終稿を保存したファイルのパス
  <%= `\`${formatPathPartsForOs('cedric', 'thank_you_drafts', 'thank_you_toast_v2_Final.docx')}\``%>

セドリックの YouTube 動画へのファイルパスを、図にある英語の名前のまま右側の入力欄に入力し、_HACK_ を押してください。
