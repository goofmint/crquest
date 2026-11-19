# else で分岐する

この練習では [else 文](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)を学びます。前の課題では [if 文](https://javascript.info/ifelse#the-if-statement)で、ある条件を満たしたときに実行するコードを定義しました。`else` は、それ以外の場合に実行するコードを指定します。

[MDN で if/else 文の仕組みを確認](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)できます。

`else` 節を使った if 文の例です。

```js
const luckyNumber = 7;

if (luckyNumber === 7) {
  console.log('Yup, 7 is a lucky number.');
} else {
  console.log('I think only 7 is a lucky number, right?');
}
```

この例では `luckyNumber` が `7` 以外なら 2 番目の文字列が出力されます。

## 樹木生命検知器を修理する

橋を延ばすため、次のコード用フォルダーに `treeLifeDetector.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

[コマンドライン引数](https://nodejs.org/api/process.html#processargv)には、木が生きているか、ほかの状態かを示す数値が渡されます。

次のひな型では、スクリプトに渡された最初の引数の値を取得します。

```js
// These lines of code take in the argument from the command line
const argumentValue = process.argv[2];
const treeLifeStatus = Number(argumentValue);

// Write your if statement below here!

```

次の例では `alive` が出力されるはずです。

```bash
node treeLifeDetector.js 0
```

次の例では `other` が出力されるはずです。

```bash
node treeLifeDetector.js 3
```

目標どおりに動いたら、*ハック*をクリックして確認してください。

## 参考資料

* [MDN：条件分岐入門](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)
* [JavaScript.info：else 文](https://javascript.info/ifelse#the-else-clause)
* [MDN：JavaScript のデータ型](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures)
