<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.northWing &&
worldState.northWing.hadSavedConversation;
%>

# 目標のヘルプ

<% if (isObjectiveReady) { %>

この目標では、ラボの北棟で学んだオブジェクトとクラスの知識を組み合わせて解決策を作ります。

目標の仕様に従って、[クラスを定義](https://javascript.info/class)してください。

次のコード用フォルダーに `targetingSolution.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

その中に `TargetingSolution` クラスを定義します。次のひな型ではすでにクラスが定義されていますが、目標を満たすには中身を追加してください。

```js
class TargetingSolution {
  constructor(config) {
    // your code here
  }

  // your code here
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const m = new TargetingSolution({
  x: 10,
  y: 15,
  z: 900,
});

console.log(m.target()); // would print "(10, 15, 900)"
```

目標どおりに動いたら、_ハック_ をクリックして確認しましょう！

## 役立つリンク

- [JavaScript.info：クラス](https://javascript.info/class)
- [MDN：クラス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes)
- [JavaScript.info：オブジェクトリテラル記法](https://javascript.info/object#literals-and-properties)
- [MDN：オブジェクト初期化子](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer)

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには、**理論物理学者のアクセスコード**が必要です。

物理学者はおそらくラボの**北棟**にいます。ダックタイピウムが時空をゆがめ、物質を操作する能力を研究していました。

**理論物理学者に話しかけ**、ビームのアクセスコードを受け取ってください。

<% } %>
