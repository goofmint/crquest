# 見落としに注意

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>freightScanner2.js</code> を作成する。</li>
  <li>文字列の配列を受け取る <code>scan</code> 関数を作る。</li>
  <li>入力配列で文字列 <code>contraband</code> が現れるすべてのインデックスを<b>数値の配列として返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** のセキュリティで守られた貨物室に、TwilioQuest の電気技師にたどり着くために無効にすべきセキュリティノードがあります。

貨物に不審なものがないか調べる JavaScript 関数の不具合で、ノードがロックされています。関数を修理してノードをハックし、**Infinite Loop** のマスターパスワードに必要なインデックスを入手しましょう。

## 検査する関数を実装する

コード用フォルダーに `freightScanner2.js` を作り、`scan` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

引数は文字列の配列ひとつです。`scan` 関数は配列のすべての文字列をループで処理し、[ブール論理](https://javascript.info/ifelse)でひとつずつ調べます。

入力配列の文字列が英語の `contraband` と一致したら、その要素の[インデックス](https://javascript.info/array#declaration)を**出力用配列**に追加します。入力配列をすべて調べたら、不審な要素すべてのインデックスが入った**出力用配列を返します**。

たとえば次の配列に対して、

```js
['contraband', 'apples', 'cats', 'contraband', 'contraband']
```

関数は次の配列を返します。

```js
[0, 3, 4]
```

この配列は、入力配列のすべての `contraband` の位置を含みます。

ひな型コードはヘルプタブにあります。準備ができたら、*ハック*でノードを解除し、電気技師の救出に必要なパスワードのインデックスを手に入れてください。
