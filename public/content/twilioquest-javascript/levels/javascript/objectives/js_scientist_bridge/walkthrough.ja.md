# else if で分岐する

この練習では、条件によって複数の方向に分岐するときに使う [else if 文](https://javascript.info/ifelse#several-conditions-else-if)を学びます。

[MDN で else if 文の仕組みを確認](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)できます。

次は else if を使った if 文の例です。

```js
const ninjaTurtle = 'Leonardo';

if (ninjaTurtle === 'Leonardo') {
  console.log('leads');
} else if (ninjaTurtle === 'Donatello') {
  console.log('does machines');
} else if (ninjaTurtle === 'Raphael') {
  console.log('cool, but cruel');
} else if (ninjaTurtle === 'Michelangelo') {
  console.log('party dude');
} else {
  console.log('not a ninja turtle');
}
```

この例は `ninjaTurtle` の値に応じて異なる文字列を出力します。

## 樹木生命検知器を修理する

橋を延ばすため、次のコード用フォルダーに `enhancedLifeDetector.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

[コマンドライン引数](https://nodejs.org/api/process.html#processargv)として、木が生きているか、ほかの状態かを示す数値が渡されます。

以下のひな型は、スクリプトに渡される最初の引数を取得します。

```js
// These lines of code take in the argument from the command line
const argumentValue = process.argv[2];
const treeLifeStatus = Number(argumentValue);

// Write your if statement below here!

```

修正したら、次のように実行して `flowering` が出力されるか確かめてください。

```bash
node enhancedLifeDetector.js 1
```

こちらでは `other` が出力されるはずです。

```bash
node enhancedLifeDetector.js 3
```

ほかの番号と状態の対応は、**目標タブ**の表にあります。

仕様どおりに動いたら、*ハック*をクリックして確認してください。

## 参考資料

* [MDN：条件分岐入門](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)
* [JavaScript.info：else if 文](https://javascript.info/ifelse#several-conditions-else-if)
