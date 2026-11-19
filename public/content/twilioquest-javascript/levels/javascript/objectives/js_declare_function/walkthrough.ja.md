# JavaScript の関数を書く

この練習では、JavaScript で[関数を定義する方法](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)を学びます。**関数**は、特定の処理を行うために何度でも**呼び出せる**コードのまとまりです。

これまでの例では、JavaScript に組み込まれた `console.log` 関数を使ってきました。この関数はターミナルに文字列を出力します。障壁を突破するには、自分で関数を作る必要があります。

このコード用フォルダーに `laserFunction.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

中には `getLaserSetting` 関数を定義します。次のひな型には関数が定義されていますが、今は誤った値を返します。

```js
function getLaserSetting() {
  const setting = 42; // <- You'll need to change this line of code!
  return setting;
}

const currentSetting = getLaserSetting();
console.log('The current laser setting is: ' + currentSetting);
```

課題を満たすよう、関数内のコードを変更してください。波括弧（`{` と `}`）が関数本体の開始と終了を示します。`{` と `}` の間に書いたコードだけが、関数の一部として実行されます。

関数は目標タブに示されたレーザー設定を**返す**必要があります。変数について学んだことを使って変更しましょう。できたら、*ハック*で確認してください。

## 役立つリンク

* [JavaScript.info：関数のガイド](https://javascript.info/function-basics)
* [関数宣言](https://javascript.info/function-basics#function-declaration)
* [関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
