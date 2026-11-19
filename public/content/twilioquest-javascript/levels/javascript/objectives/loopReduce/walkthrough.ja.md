# 配列から値を計算する

この練習では、[既存の配列の要素をもとにひとつの値を計算する方法](https://javascript.info/array-methods#reduce-reduceright)を学びます。

次のコード用フォルダーに `freightMass.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

そこで `calculateMass` 関数を定義してください。以下はひな型です。関数の枠がありますが、目標どおりに動くように中身を実装します。

```js
function calculateMass(freightItems) {
  // This is a placeholder for the total length in characters of all strings
  // in the freightItems array
  let totalMass = 0;

  /*
  Replace this comment with your code.
  Use the array reduce() function to replace the value of totalMass.
  Note that it is possible to use forEach or other loop types to do this, but
  using "reduce" is probably the most elegant solution!
  */

  return totalMass;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const mass = calculateMass(['dog', 'donkey', 'cat']);
console.log('Total mass of items is ' + mass); // should be 12
```

この処理には[配列の組み込み関数 reduce](https://javascript.info/array-methods#reduce-reduceright) を使えます。配列内の文字列の長さは、`length` プロパティで調べられます。

目標どおりに動いたら、*ハック*をクリックして確認してください。

## 役立つリンク

* [JavaScript.info：配列の reduce](https://javascript.info/array-methods#reduce-reduceright)
* [JavaScript.info：if 文](https://javascript.info/ifelse)
* [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
