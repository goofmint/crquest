# 配列をひとつにまとめる

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>freightMass.js</code> を作成する。</li>
  <li>文字列の配列をひとつだけ受け取る <code>calculateMass</code> 関数を作る。</li>
  <li>入力配列にあるすべての文字列の長さを合計し、<b>数値を返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** のセキュリティで守られた貨物室で、TwilioQuest の電気技師にたどり着くために解除すべきセキュリティノードを発見しました。

船の貨物を検査して総質量を計算する JavaScript 関数の不具合で、このノードがロックされています。関数を修理してノードをハックすれば、**Infinite Loop** のマスターパスワードに必要なインデックスが手に入ります。

## 質量の計算を直す

コード用フォルダーに `freightMass.js` を作り、`calculateMass` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

引数は文字列の配列ひとつです。`calculateMass` では[配列の reduce](https://javascript.info/array-methods#reduce-reduceright) を使い、入力配列の各文字列の長さを取得し、**すべての文字列の長さの合計**を求めます。その長さを貨物の総質量として返してください。

次は関数の呼び出しと戻り値の例です。

```js
const cargo = ['cat', 'dog', 'bird'];

const mass = calculateMass(cargo);
// mass should now be 10
```

ひな型コードはヘルプタブにあります。準備ができたら、*ハック*でノードを解除し、電気技師の救出に必要なパスワードのインデックスを入手しましょう。
