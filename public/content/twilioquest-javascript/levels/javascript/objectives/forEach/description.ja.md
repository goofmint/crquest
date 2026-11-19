# 要素ごとに処理

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>freightScanner.js</code> を作成する。</li>
  <li>文字列の配列を引数に取る <code>scan</code> 関数を作る。</li>
  <li>文字列 <code>contraband</code> が入力配列に現れる回数を<b>数値で返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** のセキュリティで守られた貨物室で、無効にすべきセキュリティノードのひとつを発見しました。このノードは、貨物に不審なものがないかを調べる JavaScript 関数の不具合でロックされています。

関数を修理してノードをハックし、**Infinite Loop** のマスターパスワードに必要なインデックスを入手しましょう。

## 貨物を検査する

コード用フォルダーに `freightScanner.js` を作成し、`scan` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

関数は文字列の配列を 1 個だけ受け取ります。`scan` はその配列の文字列すべてをループで処理し、[ブール論理](https://javascript.info/ifelse)でひとつずつ調べます。

文字列が英語の `contraband` と一致したら、`contraband` を見つけた回数を表す数値を[増やします](https://javascript.info/operators#increment-decrement)。配列の最後まで処理したら、**配列内で `contraband` が見つかった回数を返してください**。

ヘルプタブにひな型コードがあります。

コードの用意ができたら、*ハック*でノードを解除し、電気技師の救出に必要なパスワードのインデックスを入手しましょう。
