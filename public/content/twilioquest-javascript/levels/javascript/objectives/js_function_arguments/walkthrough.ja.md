# JavaScript の関数を書く

この練習では、**引数**（パラメーター）を受け取る[関数を作る方法](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)を学びます。引数とは、関数が受け取る入力データで、入力に応じた出力を得るために使えます。

次のコード用フォルダーに `politeLasers.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中で `getLaserSetting` 関数を定義します。以下のひな型では関数自体は定義済みですが、目標どおりには動きません。

```js
function getLaserSetting(magicWord) {
  if (magicWord === 'the magic word here') {
    return 'what should this be?';
  } else {
    return 'ON';
  }
}

const currentSetting = getLaserSetting('right now!');
console.log('The current laser setting is: ' + currentSetting);
```

仕様では、最初の引数に応じて `OFF` を返します。例の `magicWord` が文字列 `please` の場合に限り、それ以外なら `ON` を返します。

目標の仕様どおりに動いたら、*ハック*をクリックして確認してください。

## 役立つリンク

* [JavaScript.info：関数のガイド](https://javascript.info/function-basics)
* [関数宣言](https://javascript.info/function-basics#function-declaration)
* [関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
