# if 文を使う

この目標では、[if 文](https://javascript.info/ifelse#the-if-statement)によって条件付きでコードを実行する方法を学びます。ログインしているときや特定のファイルが存在するときなど、条件を満たす場合にだけコードを実行したい場面はよくあります。

[MDN で if 文の仕組みを確認](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)できます。

[比較演算子](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comparison_Operators) `===` で 2 つの文字列が同じか確かめ、一致したら文字列を出力する if 文の例です。

```js
const animal = 'Dog';

if (animal === 'Dog') {
  console.log('woof!');
}
```

比較式は[真偽値](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures)の `true` または `false` になります。真なら if 文の波括弧 `{` `}` 内のコードが実行されます。

## 橋を延ばす

このコード用フォルダーに `northBridgeControl.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

主任研究員のオフィスでパスワードを取ったときと同じく、[コマンドライン引数](https://nodejs.org/learn/command-line/accept-input-from-the-command-line-in-nodejs)を使います。決まった引数が渡された場合に限り、メッセージを出力してください。

以下のひな型は最初の引数を取得します。ただし、このままでは if 文が**正しく動きません**。目標に合わせて修正してください。

```js
const argumentValue = process.argv[2];

// Modify the if statement below to execute if and only if "argumentValue" is
// equal to the string "EXTEND"
if (false) {
  console.log('Extending bridge!');
}
```

次のように実行すると、メッセージが出るはずです。

```bash
node northBridgeControl.js EXTEND
```

次の例では何も出力されないはずです。

```bash
node northBridgeControl.js GO
```

仕様どおりに動いたら、*ハック*をクリックして確認しましょう。

## 参考資料

* [MDN：条件分岐入門](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)
* [JavaScript.info：if 文](https://javascript.info/ifelse#the-if-statement)
* [MDN：JavaScript のデータ型](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures)
