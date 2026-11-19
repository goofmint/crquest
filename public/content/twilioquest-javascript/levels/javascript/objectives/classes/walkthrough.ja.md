# クラスに慣れよう

この練習の目的は JavaScript の[クラス](https://javascript.info/class)に慣れることです。クラスを使うと、自分のコードで新しい種類のオブジェクトを作れます。

これまでラボでは、数値、文字列、真偽値などの組み込みオブジェクトやプリミティブ型を主に使ってきました。クラスを使うと、ユーザー、ブログ記事、いいね、購読など、そのコードに特有の複雑なデータを表現できます。[オブジェクトリテラル](https://javascript.info/object#literals-and-properties)とクラスには、どちらもメソッドを定義できます。クラスを使うと、共通の構造と振る舞いを持つインスタンスを複数作れます。

この課題では、目標の仕様に基づいて[クラスを定義](https://javascript.info/class)してください。

次のコード用フォルダーに `classes.js` を作成します。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

このファイルで `Materializer` を定義してください。以下のひな型にはクラスの定義がすでにありますが、目標で求められる動作はまだ実装されていません。

```js
class Materializer {
  constructor(targetName) {
    // your code here
  }

  // your code here
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const m = new Materializer('Kevin');
console.log(m.activated); // would print "false"

m.activate();
console.log(m.activated); // would print "true"

console.log(m.materialize()); // would print "Kevin"
```

目標どおりに動いたら、*ハック*をクリックして確認しましょう。

## 役立つリンク

* [JavaScript.info：クラス](https://javascript.info/class)
* [MDN：クラス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)
