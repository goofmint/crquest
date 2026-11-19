<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.southWing &&
worldState.southWing.hadSavedConversation;
%>

# ビーム 2 を起動する

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
  <li><code>sortOrder.js</code> を作成する。</li>
  <li>受け取った 2 つのコマンドライン引数を比較する。</li>
  <li>アルファベット順を調べ、以下の説明に従い <code>-1</code>、<code>0</code>、<code>1</code> のいずれかを出力する。</li>
</ul>
<% } else { %>
<ul>
  <li>ラボの南棟で植物学者を見つけ、話しかける。</li>
  <li>ここに戻り、ビーム 2 を起動する。</li>
</ul>
<% } %>
</div>

<% if (isObjectiveReady) { %>

植物学者の起動コードで、この停止ビームの操作盤が使えるようになりました。診断すると、**文字列をアルファベット順に並べ替える**スクリプトが欠けていると分かりました。レーザーの復旧には、このスクリプトを書き直す必要があります。

## アルファベット順に並べる

コード用フォルダーに `sortOrder.js` を作成します。スクリプトは**2 つのコマンドライン引数**で文字列を受け取り、大文字と小文字を区別せず、どちらがアルファベット順で先かを比較します。

次のようにスクリプトを実行して試してください。

```bash
node sortOrder.js cats dogs
```

最初の文字列が 2 番目より前か、同じか、後かを判断し、`console.log` で次の数値を出力します。

- 最初の引数がアルファベット順で**前**なら `-1`。
- 2 つの引数が**同じ**なら `0`。
- 最初の引数がアルファベット順で**後**なら `1`。

比較が正しく動いたら、_ハック_ をクリックしてレーザーを再起動しましょう！

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには**植物学者のアクセスコード**が必要です。

植物学者はおそらく、ダックタイピウムが植物に与える影響を調べていたラボの**南棟**にいます。

**植物学者に話しかけ**、このビームのアクセスコードを受け取ってください。

<% } %>
