# 関数の引数

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>politeLasers.js</code> を作成する。</li>
  <li>文字列をひとつ受け取る <code>getLaserSetting</code> 関数を作る。</li>
  <li>引数が "please" なら "OFF" を返し、それ以外なら "ON" を返す。</li>
  <li>できたら<em>ハック</em>をクリックする。</li>
</ul>
</div>

このセキュリティ障壁も故障しています。調べてみると、原因は IT 部門の旧友グレンでした。丁寧に頼まれたときだけ停止するよう、この障壁を設定したのです。

突破するには、[引数](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)（パラメーター）を受け取る関数を書き、基本的な[ブール論理](https://javascript.info/ifelse)を使います。

関数の引数についてはヘルプタブを参照してください。ブール論理が分からない場合は、先にラボの**南棟**の課題を進めるとよいでしょう。

## 障壁を解除する

前の障壁と同じように、レーザーを `"ON"` にするか `"OFF"` にするかは **JavaScript 関数**で決まります。障壁を解除するには、その**関数を上書き**してください。

コード用フォルダーに `politeLasers.js` を作ります。前の課題と同じく `getLaserSetting` という[JavaScript 関数を定義](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)します。

今回は `getLaserSetting` の**最初の引数**に応じて戻り値を変えます。文字列 `please` の場合は `OFF` を、それ以外の場合は `ON` を返します。文字列は英語のままにしてください。

準備できたら、*ハック*をクリックしてレーザー制御関数を書き換えましょう。
