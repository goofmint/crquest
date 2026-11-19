# インデックスを探す

この練習では、[ループを使って配列の要素をひとつずつ処理する方法](https://javascript.info/array-methods#iterate-foreach)を学びます。入力リストの各要素を処理することは、プログラミングでよくあります。ループ（反復）と呼ばれるこの処理が、目標を達成するために必要です。

次のコード用フォルダーに `freightScanner2.js` を作成してください。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中に `scan` 関数を定義します。以下に関数のひな型があります。目標の仕様を満たすように中身を実装してください。

```js
function scan(freightItems) {
  let contrabandIndexes = [];

  /*
  Replace this comment with your code.

  Your code needs to:
  - Loop through every item in the freightItems array
  - if the item is equal to "contraband", add the current index of the item 
    to contrabandIndexes - hint: use the array "push()" method

  */

  return contrabandIndexes;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const indexes = scan(['dog', 'contraband', 'cat', 'zippers', 'contraband']);
console.log('Contraband Indexes: ' + indexes); // should be [1, 4]
```

仕様どおりに動いたら、*ハック*をクリックして確認します。

## 役立つリンク

* [JavaScript.info：forEach を使った反復](https://javascript.info/array-methods#iterate-foreach)
* [JavaScript.info：if 文](https://javascript.info/ifelse)
* [JavaScript.info：配列の push](https://javascript.info/array#methods-pop-push-shift-unshift)
* [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
