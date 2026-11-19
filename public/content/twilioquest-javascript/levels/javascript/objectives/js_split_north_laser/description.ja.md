<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.northWing &&
worldState.northWing.hadSavedConversation;
%>

# ビーム 4 を起動する

<style>
table.lasers {
  margin-top: 10px;
}
table.lasers th, table.lasers td {
  text-align: center !important;
}
table.lasers td span {
  font-weight: bold;
}
table.lasers td span.on {
  color: green;
}
table.lasers td span.off {
  color: red;
}
</style>

<table class="lasers">
  <tr>
    <th>ビーム 1</th>
    <th>ビーム 2</th>
    <th>ビーム 3</th>
    <th>ビーム 4</th>
  </tr>
  <tr>
    <td>
      <% if (worldState.beamOneOnline) { %>
        <span class="on">稼働中</span>
      <% } else { %>
        <span class="off">停止中</span>
      <% } %>
    </td>
    <td>
      <% if (worldState.beamTwoOnline) { %>
        <span class="on">稼働中</span>
      <% } else { %>
        <span class="off">停止中</span>
      <% } %>
    </td>
    <td>
      <% if (worldState.beamThreeOnline) { %>
        <span class="on">稼働中</span>
      <% } else { %>
        <span class="off">停止中</span>
      <% } %>
    </td>
    <td>
      <% if (worldState.beamFourOnline) { %>
        <span class="on">稼働中</span>
      <% } else { %>
        <span class="off">停止中</span>
      <% } %>
    </td>
  </tr>
</table>

<div class="aside">
<h3>やること</h3>
<% 
if (isObjectiveReady) {
%>
<ul>
  <li><code>targetingSolution.js</code> を作成する。</li>
  <li>目標の仕様に従って <code>TargetingSolution</code> クラスを作成する。</li>
</ul>
<% } else { %>
<ul>
  <li>ラボの北棟に閉じ込められた理論物理学者を見つけ、話しかける。</li>
  <li>ここに戻り、ビーム 4 を起動する。</li>
</ul>
<% } %>
</div>

<% if (isObjectiveReady) { %>

物理学者のコードを入力すると表示が点灯し、ビーム 4 の装置を調べられるようになりました。

事故でビームの照準システムが損傷したようです。再起動するには、[JavaScript のクラス](https://javascript.info/class)と[オブジェクトリテラル](https://javascript.info/object#literals-and-properties)で新たな照準処理を実装してください。

## ビームを再起動する

コード用フォルダーに `targetingSolution.js` を作り、`TargetingSolution` という [JavaScript クラスを定義](https://javascript.info/class)します。このクラスはレーザーの照準情報を保持し、座標を所定の形式の文字列で返します。

コンストラクターの引数は、ラボの三次元空間内にある目標の正確な x、y、z 座標を含むオブジェクトリテラル 1 個です。

`TargetingSolution` のコンストラクターでは、設定オブジェクトの次の 3 つのプロパティをインスタンスに保持します。

| プロパティ | 型 |
| --- | --- |
| x | number |
| y | number |
| z | number |

さらに `target` というインスタンスメソッドを実装し、そのインスタンスの目標座標を `(x, y, z)` の文字列として返します。括弧、空白、カンマも含めてください。

作るクラスの使用例です。

```js
const sln = new TargetingSolution({
  x: 45,
  y: 12,
  z: -1,
});

console.log(sln.target()); // Should output a string of (45, 12, -1)
```

**例のとおりに文字列の形式と空白をそろえてください！**

ひな型コードはヘルプタブにあります。用意ができたら、_ハック_ をクリックしてレーザーを復旧させましょう。

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには、**理論物理学者のアクセスコード**が必要です。

物理学者はおそらくラボの**北棟**にいます。ダックタイピウムが時空をゆがめ、物質を操作する能力を研究していました。

**理論物理学者に話しかけ**、ビームのアクセスコードを受け取ってください。

<% } %>
