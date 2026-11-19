# ループしてみよう

この練習の目標は、[ループで配列の要素を順に処理する方法](https://javascript.info/array-methods#iterate-foreach)を学ぶことです。入力されたリストのひとつひとつに処理を行うことは、プログラミングでよくあります。これをループや反復と呼び、この課題でも使います。

次のコード用フォルダーに `freightScanner.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

ファイル内では `scan` 関数を定義します。以下にひな型があります。この段階では関数の枠だけがあり、目標の動作はまだ実装されていません。

```js
function scan(freightItems) {
  let contrabandCount = 0;

  /*
  Replace this comment with your code.

  Your code needs to:
  - Loop through every item in the freightItems array
  - if the item is equal to "contraband", increase contrabandCount by one

  */

  return contrabandCount;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const numItems = scan(['dog', 'contraband', 'cat', 'zippers', 'contraband']);
console.log('Number of "contraband": ' + numItems); // should be 2
```

関数が仕様どおりに動いたら、*ハック*をクリックして確認してください。

## 役立つリンク

* [JavaScript.info：forEach を使った反復](https://javascript.info/array-methods?utm_source=twilioquest-3#iterate-foreach)
* [JavaScript.info：if 文](https://javascript.info/ifelse)
* [JavaScript.info：数値を増やす](https://javascript.info/operators#increment-decrement)
* [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
