<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.beamTwoOnline &&
worldState.beamThreeOnline &&
worldState.beamFourOnline;
%>

# 目標のヘルプ

<%
if (isObjectiveReady) {
%>

この目標では今まで学んだ JavaScript を総動員します。クラス、配列メソッド、ブール論理がすべて必要です。

次のコード用フォルダーに `ducktypium.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

ここに `Ducktypium` クラスを定義してください。以下のひな型にはクラスの枠がありますが、目標どおりに動くようにするには実装を追加しなければなりません。

```js
class Ducktypium {
  constructor(color) {
    // your code here
  }

  // your code here
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const dt = new Ducktypium("red");

console.log(dt.color); // prints 'red'

console.log(dt.refract("blue")); // prints 'purple'
console.log(dt.refract("red")); // prints 'red'

dt.calibrate([3, 5, 1]);

console.log(dt.calibrationSequence); // prints [3, 9, 15]
```

これまで学んだことを復習したいときは、ラボのほかの棟に戻って練習できます。

目標どおりに `Ducktypium` クラスが実装できたら、_ハック_ をクリックして実験を逆転させましょう！

## 役立つリンク

- [JavaScript.info：総合リファレンス](https://javascript.info/)
- [MDN：JavaScript リファレンス](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction)

<% } else { %>
この目標を完了する前に、次のことが必要です。

1. 行方不明の科学者を 3 人見つける。
1. 起動コードを使ってこの部屋のほかの 3 本のビームを起動する。

ラボのほかの区画を探しましょう。主実験室（今いる部屋）の南、東、西の区画にひとりずついます。

ほかの 3 本が復旧したら、**ここへ戻って最後のビームを起動**してください。
<% } %>
