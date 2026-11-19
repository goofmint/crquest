# 複数の条件を組み合わせる

ブール値を比較するとき、分岐を決めるために複数の条件を評価することがあります。そのために AND（`&&`）と OR（`||`）を使います。これらを**論理演算子**と呼びます。

[JavaScript.info で論理演算子について学ぶ](https://javascript.info/logical-operators)ことができます。

少し複雑な比較を使う if 文の例です。

```js
const name = 'Cedric';
const isRobot = true;
const awesomenessLevel = 1000;

if (
  name === 'Cedric' &&
  isRobot &&
  awesomenessLevel > 10
) {
  console.log('Yup, that is our Cedric!');
}
```

## スプリンクラーの修理

次のコード用フォルダーに `shouldWater.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

今回は、スクリプトで 2 つの引数を扱います。次のひな型を使ってください。

```js
const lifeStatus = Number(process.argv[2]);
const drynessLevel = Number(process.argv[3]);

// Your if statement goes below...
if (false) {
  console.log('WATER');
}
```

次のように実行して試します。

```bash
node shouldWater.js 1 20
```

この例では乾燥度が 10 より大きいものの、植物の状態が 0 ではなく 1 なので何も出力されません。

次の例では `WATER` が出力されます。最初の引数が `0` で、2 番目が `10` より大きいためです。

```bash
node shouldWater.js 0 11
```

仕様どおりに動いたら、*ハック*をクリックしてください。

## 参考資料

* [MDN：条件分岐入門](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)
* [JavaScript.info：論理演算子](https://javascript.info/logical-operators)
