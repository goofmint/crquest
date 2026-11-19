# 配列の組み込み関数を使う

この課題の目的は、配列内のデータを操作するための[配列に組み込まれた関数](https://javascript.info/array-methods)に慣れることです。特に、次の関数を使います。

* [sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) は配列の中の要素をすべて並べ替え、**既存の配列そのものを書き換えます**。
* [slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice) は指定した配列の一部から**新しい配列を作ります**。

## ひな型コード

次のコード用フォルダーに `getFirstAmountSorted.js` というファイルを作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

以下のひな型コードをそのファイルに貼り付けてください。

```js
function getFirstAmountSorted(inputArray, numberOfItems) {
  // Step 1: sort inputArray alphabetically
  // Step 2: create an array which contains the first N items of the sorted
  //         array - the number of items is provided in the numberOfItems 
  //         variable
  // Step 3: return the new array you created at step 2
}

// The lines of code below test your function when you execute your code in
// the terminal - they are not required for your function to work
const newArray = getFirstAmountSorted(['cat', 'apple', 'bat'], 2);
console.log(newArray); // << should print out ['apple', 'bat']
```

目標タブの仕様に従い、`getFirstAmountSorted` の中身を実装します。並べ替えと切り出しができたら、*ハック*をクリックしましょう。

## 参考資料

* [JavaScript.info：配列メソッド](https://javascript.info/array-methods)
* [MDN：sort のリファレンス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort)
* [MDN：slice のリファレンス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice)
