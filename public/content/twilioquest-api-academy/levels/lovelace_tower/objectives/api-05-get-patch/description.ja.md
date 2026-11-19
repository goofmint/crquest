# GET と PATCH

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>「getAndPatchCorruptedInscription」という名前の async 関数を作成します。</li>
  <li>関数は文字列の guid を受け取ります。その値を PATCH リクエスト本文の guid に指定します。</li>
  <li>「divination」エンドポイントから壊された碑文を取得し、解析します。</li>
  <li>図書館に散らばった巻物から、碑文の断片を集めます。</li>
  <li>修復した碑文と guid を「divination」エンドポイントに送ります。</li>
  <li>できたら <em>HACK</em> を押します。</li>
</ul>
</div>

<i>
ラブレス塔の最後の課題へようこそ。<br><br>
寮の試練を進めた皆さんは、この像の正面に刻まれたラブレス寮の占術の言葉を読むことができます。碑文は塔で手に入れた占術の呪文の中核です。一語一語が、呪文を使うために欠かせません……。
</i>

ラブレスの秘密図書館で何かが起きたようです。本は棚から引き出され、部屋に散らばっています。占術の碑文まで壊されました！ 今まで学んだことをすべて使い、ラブレス寮の碑文を直して、占術の呪文をもう一度使えるようにしましょう！<br><br>
まず、壊された碑文を `fetch` で取得し、どこを直すか確認します。次に、図書館に散らばった巻物から断片を集め、英語の原文をそのままつないで QuestIDE 内の文字列にします。最後に、直した碑文を「divination」エンドポイントに `patch` リクエストで送ります。

`patch` リクエストを送る例を見てみましょう。

```js
const response = await fetch("{{DIVINATION_ENDPOINT}}", {
  method: "PATCH",
  body: JSON.stringify({
    guid: "{{GUID_ARGUMENT}}",
    data: {
      inscription: "{{REPAIRED_INSCRIPTION}}",
    },
  }),
});

// This code isn't required, but can be helpful in tracking errors
const jsonData = await response.json();
console.log(jsonData);
```

`getAndPatchCorruptedInscription` という名前の関数を作ります。「divination」エンドポイントから壊された碑文を取得し、図書館にある断片から欠けた部分を探して QuestIDE でつなぎます。修復した英語の碑文と「guid」を「patch」リクエストで「divination」エンドポイントに送ってください。受け取ったレスポンスを表示するには `console.log` が役立ちます。

できたら _HACK_ を押してください！
