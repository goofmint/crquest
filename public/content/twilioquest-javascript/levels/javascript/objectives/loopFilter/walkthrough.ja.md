# 配列から不要な要素を除く

この練習では、[配列の要素を絞り込み](https://javascript.info/array-methods#filter)、コードに不要な要素を取り除く方法を学びます。

次のコード用フォルダーに `freightFilter.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中に `scanAndFilter` 関数を定義します。以下のひな型には関数の枠がありますが、目標のとおりに動くように中身を実装してください。

```js
function scanAndFilter(freightItems, forbiddenString) {
  // This is an array variable you can override with your filtered array
  let filteredItems = [];

  /*
  Replace this comment with your code.
  Use the array filter() function to replace filteredItems with a new array of
  strings that don't include the value of forbiddenString
  */

  return filteredItems;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const filtered = scanAndFilter(
  ['dog', 'ray gun', 'cat', 'zippers', 'ray gun'],
  'ray gun'
);
console.log('Filtered Items');
console.log(filtered); // should be ['dog', 'cat', 'zippers']
```

この作業には[配列の組み込み関数 filter](https://javascript.info/array-methods#filter) を使います。

仕様どおりに動いたら、*ハック*をクリックして確認してください。

## 役立つリンク

* [JavaScript.info：配列の filter](https://javascript.info/array-methods#filter)
* [JavaScript.info：if 文](https://javascript.info/ifelse)
* [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
