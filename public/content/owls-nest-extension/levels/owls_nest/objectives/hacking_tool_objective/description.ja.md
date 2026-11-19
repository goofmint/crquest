<%
const worldState = levelState['com.twilioquest.owls_nest'];
%>

# ハッキング画面を使う

<div class="aside">
<h3>やること</h3>
<ul>
  <li>この部屋の台座からハッキングツールを手に入れましょう。</li>
  <li>「目標」タブ（この画面）で秘密のパスコードを見つけましょう。</li>
  <li>右側の欄にパスコードを入力し、<em>ハック</em> を押しましょう。</li>
</ul>
</div>

TwilioQuest の世界には、この端末のように**ハッキングできる物**がたくさんあります。TwilioQuest 計画で開発された最新のハッキングツールがあれば、技術課題などを解いて装置を操作できます。質問に答えたり、自分のパソコン上でファイルにコードを書いたり、課題の内容はさまざまです。

この課題をクリアするには、**この部屋の台座にあるハッキングツールを入手**してください。すると、レーザー障壁を解除するパスコードが下の枠に表示されます。右の入力欄にパスコードを英語のまま入力して、*ハック* を押すとレーザー障壁が解除されます。

<style>
.passcode {
  color: #eee;
  padding: 10px;
  text-align: center;
}

.passcode h3 {
  font-size: 1.5em;
  border-bottom: none;
  padding: 0;
  margin: 0 0 10px 0;
  font-weight: bold;
  text-transform: uppercase;
}

.passcode p {
  margin: 0 0 5px 0;
  padding: 0;
}

.passcode-locked {
  border: 5px solid #8B0000;
  background-color: #DC143C;
}

.passcode-open {
  border: 5px solid #8FBC8F;
  background-color: #7FFF00;
  color: #232323;
}
</style>

<% if (worldState.hackingToolAcquired) { %>
<div class="passcode passcode-open">
<h3>パスコードを表示中</h3>
<p>
レーザー解除コードは <b>LEVEL UP</b> です。
</p>
<p>
<i>右側の入力欄にこのコードを入力し、「ハック」を押してください。</i>
</p>
</div>
<% } else { %>
<div class="passcode passcode-locked">
<h3>パスコードはロック中</h3>
<p>
このシステムを解除してパスコードを見るにはハッキングツールが必要です。<b>この部屋の台座で見つけてください</b>。
</p>
</div>
<% } %>
