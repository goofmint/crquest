# 目標のヘルプ

次のコード用フォルダーに `addFirstToLast.js` を作ってください。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

`addFirstToLast.js` には、文字列の配列を 1 個だけ受け取る `addFirstToLast` 関数を定義します。配列の最初と最後の要素を連結した文字列を返してください。

ひな型コードです。

```js
function addFirstToLast(inputArray) {
  let firstAndLast = '';

  // Only execute this code if the array has items in it
  if (inputArray.length > 0) {
    // Change the line below! What should it be?
    firstAndLast = inputArray[999] + inputArray[999];
  }

  return firstAndLast;
}

// The lines of code below will test your function when you run it from the
// command line with Node.js
console.log(addFirstToLast(['first', 'second', 'third']));
console.log(addFirstToLast(['golden', 'terrier']));
console.log(addFirstToLast(['cheerio']));
console.log(addFirstToLast([]));
```

コードを正しく動かすには、配列の要素を適切な**インデックス**で参照する必要があります。[配列の宣言と要素の参照](https://javascript.info/array#declaration)を確認してください。インデックスは配列内の位置を先頭から示す数で、**0 から始まります**。

関数を仕様どおりに修正できたら、*ハック*で確認しましょう。

## 役立つリンク

* [JavaScript.info：配列を作る](https://javascript.info/array)
* [MDN：配列のリファレンス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
* [JavaScript の第一歩：配列](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps/Arrays)
