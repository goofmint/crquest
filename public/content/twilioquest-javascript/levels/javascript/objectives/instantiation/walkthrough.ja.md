# 複雑なオブジェクトを作る

この練習では JavaScript の[オブジェクトリテラル記法](https://javascript.info/object#literals-and-properties)を学びます。

ラボでは、これまで数値、文字列、真偽値などの組み込みオブジェクトやプリミティブ型を主に使ってきました。一方で、コードで独自の複雑なデータを表したいことがあります。たとえばユーザー、ブログ記事、いいね、購読などです。

そうしたデータを作る方法のひとつが[オブジェクトリテラル](https://javascript.info/object#literals-and-properties)です。こうして作ったオブジェクトは各種のプロパティを持てるほか、変数ひとつに代入できます。

次のコード用フォルダーに `construction.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中に `construct` 関数を定義します。関数は以下のひな型にありますが、目標の仕様を満たすには中身を変更してください。

```js
function construct(name) {
  let person = {};

  return person;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const somePerson = construct('Kevin');
console.log('name is: ' + somePerson.name); // should be "Kevin"
console.log('duration is: ' + somePerson.duration); // should be 1000
```

関数が目標どおりに動いたら、*ハック*をクリックして確認しましょう。

## 役立つリンク

* [JavaScript.info：オブジェクトリテラル記法](https://javascript.info/object#literals-and-properties)
* [MDN：オブジェクト初期化子](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer)
* [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
* [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
