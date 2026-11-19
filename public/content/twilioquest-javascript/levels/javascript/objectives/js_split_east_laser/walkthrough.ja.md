<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.eastWing &&
worldState.eastWing.hadSavedConversation;
%>

# 目標のヘルプ

<% if (isObjectiveReady) { %>

この目標では、**Infinite Loop** から電気技師を救出するときに学んだ手法を組み合わせます。

次のコード用フォルダーに `laserPower.js` を作成してください。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

ファイル内で `calculatePower` 関数を定義します。以下のひな型に関数の枠はありますが、このままでは目標どおりには動きません。

```js
function calculatePower(powerSettings) {
  let totalPower = 0;

  return totalPower;
}

// The following lines of code are not required for the solution, but can be
// used by you to test your solution.
const laserPower = calculatePower([1, 3, 8]);
console.log("Required laser power is " + laserPower); // should be 24
```

ここまでの道のりで必要な知識は身についています。挑戦しましょう！

`calculatePower` が仕様どおりに動いたら、_ハック_ をクリックしてください。

## 役立つリンク

- [JavaScript.info：配列の reduce](https://javascript.info/array-methods#reduce-reduceright)
- [JavaScript.info：配列の map](https://javascript.info/array-methods#map)
- [JavaScript.info：if 文](https://javascript.info/ifelse)
- [JavaScript.info：関数から値を返す](https://javascript.info/function-basics#returning-a-value)
- [MDN：関数のガイド](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには、**電気技師のアクセスコード**が必要です。

電気技師はおそらく、ラボの**東棟**にドッキングしている補給貨物船にいます。爆発直前に新しい物資を受け取っていたようです。

**電気技師に話しかけ**、ビームのアクセスコードを受け取ってください。

<% } %>
