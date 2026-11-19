# 必要な要素だけを選ぶ

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>freightFilter.js</code> を作成する。</li>
  <li>第 1 引数に文字列の配列、第 2 引数に文字列を取る <code>scanAndFilter</code> 関数を作る。</li>
  <li>第 2 引数と一致する要素をすべて除いた<b>文字列の配列を返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** のセキュリティで守られた貨物室で、TwilioQuest の電気技師にたどり着くために無効にすべきセキュリティノードを発見しました。

ノードは、船の貨物を検査して不審なものを除く JavaScript 関数の不具合でロックされています。関数を修理し、ノードをハックして、**Infinite Loop** のマスターパスワードに必要なインデックスを手に入れましょう。

## 検査して絞り込む

コード用フォルダーに `freightFilter.js` を作り、`scanAndFilter` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

引数は 2 つです。最初に文字列の配列、次にその配列から取り除く文字列を指定します。`scanAndFilter` では[配列の filter](https://javascript.info/array-methods#filter) を使い、**絞り込んだ配列を返します**。

使用例と戻り値を確認してください。

```js
const cargo = ['apples', 'ray guns', 'oranges', 'tacos', 'ray guns'];

const filteredCargo = scanAndFilter(cargo, 'ray guns');
// filteredCargo should now be ['apples', 'oranges', 'tacos']
```

ヘルプタブにひな型コードがあります。準備ができたら、*ハック*でノードを解除し、電気技師の救出に必要なパスワードのインデックスを入手しましょう。
