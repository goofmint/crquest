# fetch でリクエストを送る

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>「getMagicalPhrase」という名前の async 関数を作成します。</li>
  <li>fetch で「magic」エンドポイントに魔法の言葉をリクエストします。</li>
  <li>テキストを読み取ります。</li>
  <li>魔法の言葉をそのまま入力欄に貼り付けます。</li>
  <li>できたら <em>HACK</em> を押します。</li>
</ul>
</div>

<i>
寮の試練、ラブレス塔の三つ目の課題へようこそ！ 今回は `await` の力を試し、`fetch` で魔法の言葉を取得します。塔の試練を終えて授かる占術の呪文を作るときにも、この手順が役立つでしょう。
</i>

まずは、API からデータを取得する例を見ましょう。

```js
const response = await fetch("some_url");
const text = await response.text();
console.log(text);
```

上の例は `fetch` で「some_url」からデータをリクエストし、`await` で取得が終わるまで待ちます。次に、レスポンスからテキストを取り出してコンソールに表示します。

「getMagicalPhrase」関数を作り、`fetch` と `await` で「magic」エンドポイントから魔法の言葉を取得してください。必要に応じて `console.log` で表示し、返された英語の文字列をそのまま入力欄に貼り付けます。

できたら _HACK_ を押してください！
