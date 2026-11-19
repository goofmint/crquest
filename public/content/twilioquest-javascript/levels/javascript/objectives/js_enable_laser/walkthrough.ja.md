<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
%>

<% if (worldState.room1.passwordFound) { %>

# パスワードをどうぞ

試行錯誤の末、レーザーのパスワードが `PEW PEW PEW!` だと分かりました。右の入力欄に英語のまま入力し、_ハック_ をクリックしてください。科学のために！

<% } else { %>

# まずパスワードを手に入れる

**専用のパスワード**がなければレーザーを再起動できません。部屋に入ったときに通り過ぎた**主任研究員に話しかけて**ください。どこを探せばよいか教えてくれます！

<% } %>
