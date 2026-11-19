<%
const pystate = levelState.pythonWorldState;
%>

# 蛇行する単語パズル
<div style="font-size: 22px;border-bottom: 2px dashed;padding:10px 0;">
<b>パズルの状態&nbsp;</b> 
<b style="color:<%= pystate.canSolvePuzzle ? 'green' : 'red' %>">
  <% if (pystate.canSolvePuzzle) { %>
    解答できます
  <% } else { %>
    まだ解答できません。下の説明を読んでください。
  <% } %>
</b>
<span style="height: 10px;display:block;"></span>
<b>集めた手がかり&nbsp;</b> 
<b>
  <%= pystate.cluesFound %> / <%= pystate.cluesTotal %>
</b>
</div>

古代の <b>Python の都市</b>では、新しい市民が知恵を示すために蛇行する単語パズルを解きました。報酬は市民の証である<b>Python の知識の杖</b>でした。下のパズルを解いて、この古代の秘宝を手に入れましょう！

## パズルの盤面
<% if (pystate.cluesFound === 0) { %>
杖の入った宝箱のそばに、風化した石板があります。石板には 3 × 3 のマス目が刻まれています。 かつて各マスに文字があったようですが、長い年月で消えてしまっています。
<% } else if (pystate.cluesFound > 0) { %>
杖の入った宝箱のそばに、風化した石板があります。石板には 3 × 3 のマス目が刻まれています。 そばにあったのみを使い、この部屋の幽霊が教えてくれた文字を丁寧に刻みます。
<% } else { %>
杖の入った宝箱のそばに、風化した石板があります。石板には 3 × 3 のマス目が刻まれています。 手がかりがすべてそろったので、そばののみで各マスに文字を刻めます。完成したパズルは次のとおりです。
<% } %>

<style>
.puzzle-grid {
  background-color: #343434;
  background-image: linear-gradient(315deg, #343434 0%, #676767 74%);
}

.puzzle-grid td {
  width: 33%;
  border: 5px solid #aaaaaa;
  text-align: center;
  color: #eee;
  font-size: 42px !important;
  vertical-align: middle !important;
  height: 100px !important;
  font-family: Papyrus, "Times New Roman", serif;
}

.puzzle-grid tr {
  background-color: transparent !important;
}
</style>

<table class="puzzle-grid">
  <tr>
    <td>
      <%= pystate.clues['one'] ? 'R' : '???' %>
    </td>
    <td>
      <%= pystate.clues['two'] ? 'N' : '???' %>
    </td>
    <td>
      <%= pystate.clues['three'] ? 'O' : '???' %>
    </td>
  </tr>
  <tr>
    <td>
      <%= pystate.clues['four'] ? 'A' : '???' %>
    </td>
    <td>
      <%= pystate.clues['five'] ? 'J' : '???' %>
    </td>
    <td>
      <%= pystate.clues['six'] ? 'S' : '???' %>
    </td>
  </tr>
  <tr>
    <td>
      <%= pystate.clues['seven'] ? 'P' : '???' %>
    </td>
    <td>
      <%= pystate.clues['eight'] ? 'Y' : '???' %>
    </td>
    <td>
      <%= pystate.clues['nine'] ? 'F' : '???' %>
    </td>
  </tr>
</table>

<% if (pystate.canSolvePuzzle) { %>
## 蛇行する単語パズルを解く
手がかりをすべて集め、パズルの全体像が現れました。[Boggle](https://en.wikipedia.org/wiki/Boggle) に似た仕組みのようです。上下左右または斜めに隣り合う文字を順につなぎ、<b>英字 5 文字の単語</b>を作りましょう。

単語を見つけたら（複数あるかもしれません）、右の欄に英語のまま入力して「ハック」を押してください。
<% } %>

## パズルを復元する

入門の儀式の間にいる幽霊たちが、謎を解く手がかりを持っています。<b>部屋にいるすべての幽霊を探して話しかけ</b>ると、一体ずつ手がかりを教えてくれます。

この場所を進むには、最初の Python 使いたちが市民になるために挑んだ、一連の試練を乗り越えなければなりません。[Python](https://www.python.org/) の基本を身につけ、先人の足跡をたどって、入門の儀式の間の秘密を解き明かしましょう。

<% if (pystate.canSolvePuzzle) { %>
手がかりがすべてそろい、最後のパズルを解けるようになりました。盤面の下の説明を読み、答えを英語で入力して「ハック」を押し、杖を手に入れましょう！
<% } else { %>
**手がかり**を見つけるたびに、上の**パズルが変化します**。**9 個すべて**を集めたらここに戻り、パズルを解きましょう！
<% } %>
