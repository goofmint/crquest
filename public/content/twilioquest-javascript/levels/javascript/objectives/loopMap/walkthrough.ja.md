# 既存の配列から新しい配列を作る

この練習では、[既存の配列の要素を処理して新しい配列を作る](https://javascript.info/array-methods#map)方法を学びます。

次のコード用フォルダーに `freightTransformer.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中に `transform` 関数を作ります。以下はひな型です。関数の枠がすでにあり、目標どおりに動かすには中身の実装が必要です。

```js
function transform(freightItems) {
  // This is an array variable you can override with your transformed array
  let transformedItems = [];

  /*
  Replace this comment with your code.
  Use the array map() function to replace transformedItems with a new array of
  strings from the input array that have been converted to ALL CAPS
  */

  return transformedItems;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const transformed = transform(["dog", "ray gun", "cat"]);
console.log("Transformed Items");
console.log(transformed); // should be ['DOG', 'RAY GUN', 'CAT']
```

この課題は[配列の組み込み関数 map](https://javascript.info/array-methods#map) を使って解決できます。文字列のすべての文字を大文字にするには、[組み込み関数 toUpperCase()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toUpperCase) を使えます。

仕様どおりに動いたら、_ハック_ をクリックして確認してください。

## 役立つリンク

- [JavaScript.info：配列の map](https://javascript.info/array-methods#map)
- [MDN：文字列の toUpperCase()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toUpperCase)
- [JavaScript.info：if 文](https://javascript.info/ifelse)
- [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
- [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
