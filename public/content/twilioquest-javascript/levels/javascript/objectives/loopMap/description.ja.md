# すべての要素を変換

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>freightTransformer.js</code> を作成する。</li>
  <li>文字列の配列をひとつだけ受け取る <code>transform</code> 関数を作る。</li>
  <li>入力配列の要素をすべて大文字に変換した<b>文字列の配列を返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** のセキュリティで守られた貨物室で、TwilioQuest の電気技師にたどり着くために無効にすべきセキュリティノードを発見しました。

船の貨物を検査し、効率的に梱包できるように貨物データを整える JavaScript 関数の不具合で、ノードはロックされています。関数を修理してノードをハックし、**Infinite Loop** のマスターパスワードに必要なインデックスを入手しましょう。

## 世界を変えよう。まずは配列から

コード用フォルダーに `freightTransformer.js` を作成し、`transform` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

引数は変換対象の文字列の配列ひとつです。`transform` では[配列の map](https://javascript.info/array-methods#map) を使い、入力配列の文字列をひとつずつ大文字に変換します。その後、**変換結果の配列を返します**。

次は関数の呼び出しと結果の例です。

```js
const cargo = ["apples", "ray guns", "oranges"];

const transformedCargo = transform(cargo);
// transformedCargo should now be ['APPLES', 'RAY GUNS', 'ORANGES']
```

ヘルプタブにひな型が用意されています。コードができたら、_ハック_ でノードを解除して、電気技師の救出に必要なパスワードのインデックスを入手しましょう。
