# fetch でリクエストを送る

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>「getFilteredAuthors」という名前の async 関数を作成します。</li>
  <li>関数は数値を受け取ります。</li>
  <li>fetch でエンドポイントから本のデータを取得し、解析します。</li>
  <li>「pageCount」より多いページ数の本に絞ります。</li>
  <li>それぞれの本を著者名に変換します。</li>
  <li>結果を返します。</li>
  <li>できたら <em>HACK</em> を押します。</li>
</ul>
</div>

<i>
競技者の皆さん、ラブレス塔の四つ目の課題へようこそ。身につけた `async` と `await` を使い、クラウドの遠い図書館に収められた特別な本の著者名を調べます。その名前は強力な呪文に関係していて、唱えれば残りの寮を進むために必要な `Divination Spell`（占術の呪文）が授かるといわれています。手がかりは一つ。それぞれの著者は、あるページ数を超える本を書いていることです。名前を突き止めたら、声に出して占術の呪文を完成させましょう。
</i>

前の課題では、API（Application Programming Interface）からデータをそのまま取得しました。今回は、新しいエンドポイントから受け取ったレスポンスを加工します。前と同じように `fetch` と `await` を組み合わせて、データをリクエストします。

API からデータを取得し、JSON（JavaScript Object Notation）のレスポンスを解析する例を見てみましょう。

```js
const response = await fetch("some_url");
const jsonData = await response.json();
console.log(jsonData);
```

上の例では「some_url」にリクエストを送り、`await` でレスポンスを待ちます。次に `response.json` で JSON を解析し、コンソールに表示します。

「getFilteredAuthors」関数を作成します。エンドポイントからデータを取得して解析し、`pageCount` の値より **多い** ページ数の本を書いた著者に絞り込みます。その著者名を原文の文字列のまま配列で返してください。

できたら _HACK_ を押してください！
