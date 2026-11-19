<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.eastWing &&
worldState.eastWing.hadSavedConversation;
%>

# ビーム 3 を起動する

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
  <li><code>laserPower.js</code> を作成する。</li>
  <li>数値の配列をひとつだけ受け取る <code>calculatePower</code> 関数を作る。</li>
  <li>目標に沿って入力配列の値を変換して足し合わせ、結果を<b>数値で返す</b>。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
<% } else { %>
<ul>
  <li>ラボの東棟で電気技師を見つけ、話しかける。</li>
  <li>ここへ戻り、ビーム 3 を起動する。</li>
</ul>
<% } %>
</div>

<% if (isObjectiveReady) { %>

電気技師から受け取ったコードを入力すると画面が点灯し、ビーム 3 につながるシステムを調べられるようになりました。

レーザーに送る出力の計算に誤りがあり、停止したようです。この計算を担う JavaScript 関数を修理してください。これまで学んだ配列の知識を総動員しましょう。

## ビームを再起動する

コード用フォルダーに `laserPower.js` を作り、その中に `calculatePower` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

引数は数値の配列ひとつです。配列にはレーザーの出力設定が入っていますが、入力値に補正が必要です。

`calculatePower` は、まず配列の値を**すべて 2 倍**にします。その後、**すべての数値を合計し、その結果を返して**ください。

コードができたら、_ハック_ をクリックして、レーザーを復旧させましょう！

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには、**電気技師のアクセスコード**が必要です。

電気技師はおそらく、ラボの**東棟**にドッキングしている補給貨物船にいます。爆発直前に新しい物資を受け取っていたようです。

**電気技師に話しかけ**、ビームのアクセスコードを受け取ってください。

<% } %>
