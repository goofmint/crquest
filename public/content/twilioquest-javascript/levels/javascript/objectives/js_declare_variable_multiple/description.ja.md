# 補給用の宝箱を開ける

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>chestConfiguration.js</code> を作成する。</li>
  <li>下の表のとおりに 3 つの変数を宣言する。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

あなたのような TwilioQuest のオペレーター向けの物資が入った宝箱を見つけました。本来なら自由に開けられるはずですが、鍵がかかっています。物資を取り出すには、**先ほどと同じ方法で設定を上書き**しましょう。

コード用フォルダーに `chestConfiguration.js` を作成し、次の変数を宣言して宝箱のセキュリティ設定を上書きします。変数名と文字列の値には表に示した英語を使ってください。

| 変数名 | 値 |
| --- | --- |
| `verifiedUser` | [真偽値](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)の `true` |
| `accessLevel` | [数値](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)の `7` |
| `favoriteRobot` | [文字列](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)の `Cedric` |

設定できたら *ハック* をクリックして確認し、セキュリティ設定を上書きします。
