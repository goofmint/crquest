# 要素を順番に並べよう

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>getFirstAmountSorted.js</code> というファイルを作成する。</li>
  <li>下記の仕様どおりに動作する <code>getFirstAmountSorted</code> 関数を作る。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

**Infinite Loop** に乗り込むと、爆発の影響でこの障壁を含む複数のシステムが故障していました。船内を進むには、配列を処理するコードを修理する必要があります。

障壁が閉じたままになる原因のコードを見つけました。これまでと同様に、**配列を処理する** JavaScript 関数を直しましょう。

## 分割と並べ替え

コード用フォルダーに `getFirstAmountSorted.js` を作り、その中に `getFirstAmountSorted` 関数を定義してください。関数は **2 個の引数**を受け取ります。最初の引数は配列、2 番目は数値です。関数の仕様は次のとおりです。

* 入力配列である最初の引数をアルファベット順に並べ替えます。
* 並べ替えた入力配列の先頭 `N` 個の要素からなる**新しい配列を返します**。`N` は 2 番目の引数の値です。

関数の使用例です。

```js
const outputArray = getFirstAmountSorted(['bird', 'dog', 'cat', 'ant'], 2);
// outputArray is now ['ant', 'bird']
```

ほかの入出力例も確認してください。

| 配列 | 数値 | 戻り値 |
| --- | --- | --- |
| ['third', 'second', 'first'] | 2 | ['first', 'second' ] |
| ['golden', 'terrier'] | 1 | ['golden'] |
| ['cheerios', 'apple jacks', 'lucky charms'] | 3 | ['apple jacks', 'cheerios', 'lucky charms'] |
| ['golden', 'terrier', 'boxer'] | 0 | [ ] |

出発点として使えるコードは**ヘルプタブ**にあります。関数が仕様どおりに動いたら、*ハック*をクリックしてください。
