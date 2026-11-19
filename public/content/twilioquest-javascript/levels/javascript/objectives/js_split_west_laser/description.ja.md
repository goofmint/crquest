<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.beamTwoOnline &&
worldState.beamThreeOnline &&
worldState.beamFourOnline;
%>

# 最後のビームを起動する

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
  <li><code>ducktypium.js</code> を作成する。</li>
  <li>これまで学んだことを使い、目標どおりの <code>Ducktypium</code> クラスを作成する。</li>
  <li>完成したら<em>ハック</em>をクリックし、実験を逆転させる。</li>
</ul>
<% } else { %>
<ul>
  <li>ラボで行方不明の科学者を 3 人見つけ、起動コードを受け取る。</li>
  <li>起動コードでビーム 2、3、4 を起動する。</li>
  <li>ここへ戻り、最後のビームを起動する。</li>
</ul>
<% } %>
</div>

<%
if (isObjectiveReady) {
%>

ほかの 3 本が復旧したので、**失敗した実験を逆転させ**、この世界を救う準備が整いました！

主ビームの操作盤を調べて、前回の実験の問題を分析します。主任研究員の計算は正しく、実験は予定どおりに進むはずでした。爆発を引き起こしたのは別の不具合で、**何者かが意図的に仕掛けた**ようです！ 犯人は必ず突き止めるとして、今は目の前の作業に戻りましょう。

細工された JavaScript ファイルは削除され、バックアップも見つかりません。ダックタイピウムの性質を定義し、結晶の安定化処理を担う重要なコードを、新たに作る必要があります。

## Ducktypium クラス

コード用フォルダーに `ducktypium.js` を作成し、`Ducktypium` クラスを定義してください。コンストラクターは結晶の色を示す文字列をひとつ受け取り、`color` インスタンス変数に保存します。色は **`red`、`blue`、`yellow` のいずれか**に限ります。それ以外の文字列が渡されたら、[エラーを投げる](https://javascript.info/try-catch#throwing-our-own-errors)ようにします。

また、`calibrationSequence` プロパティを定義し、初期値を**空の配列**にします。

Ducktypium クラスには、以下で説明する `refract` と `calibrate` の 2 つのインスタンスメソッドが必要です。

## `refract` メソッド

このメソッドは、ダックタイピウムに色の付いた光を当てたときの屈折を表します。

`refract` メソッドは文字列をひとつ受け取ります。`red`、`blue`、`yellow` のいずれかです。コンストラクターと同じく、それ以外の場合は[エラーを投げます](https://javascript.info/try-catch#throwing-our-own-errors)。インスタンスの `color` と `refract` に渡された色を組み合わせ、結果を**ひとつの文字列として返します**。

- インスタンスの `color` と引数が同じ色なら、その値を返す。
- 異なる色なら、2 つの[原色](https://en.wikipedia.org/wiki/Primary_color)を合わせた色の文字列を英語のまま返す。

原色の組み合わせは次のとおりです。

- <span style="color:red">red</span> + <span style="color:blue">blue</span> = <span style="color:purple">purple</span>
- <span style="color:red">red</span> + <span style="color:#ad9400">yellow</span> = <span style="color:orange">orange</span>
- <span style="color:#ad9400">yellow</span> + <span style="color:blue">blue</span> = <span style="color:green">green</span>

## `calibrate` メソッド

もうひとつのメソッドは、ダックタイピウムの結晶を安定化させるための調整値を作ります。

`calibrate` が受け取る引数は、数値の配列ひとつです。入力配列を次のように処理します。

- 数値を小さい順に並べ替える。
- 各数値を `3` 倍する。
- 結果の配列を `Ducktypium` インスタンスの `calibrationSequence` に代入する。

## 使用例

完成した Ducktypium クラスは、次のように動作します。

```js
// The following would produce an error
try {
  const badColor = new Ducktypium("pink");
} catch (e) {
  console.log("Color must be red, yellow, or blue!");
}

// Create a new instance of the class
const dt = new Ducktypium("red");

console.log(dt.color); // prints 'red'

console.log(dt.refract("blue")); // prints 'purple'
console.log(dt.refract("red")); // prints 'red'

dt.calibrate([3, 5, 1]);

console.log(dt.calibrationSequence); // prints [3, 9, 15]
```

ヘルプタブにひな型コードがあります。今まで学んだ JavaScript を総動員して、クラウドの世界を救いましょう！

`ducktypium.js` の準備ができたら、_ハック_ をクリックして実験を逆転させてください。

<% } else { %>
ダックタイピウムの実験を逆転させるには、このビーム 1 を含む**停止ビーム 4 本すべてを復旧**させなければなりません。ビーム 1 の前に、ビーム 2、3、4 を復旧させる必要があります。

主任研究員によると、ほかの 3 本を再起動するには**同僚たちが持つ起動コード**が必要です。ラボで研究員を 3 人見つけ、**起動コードを使って**この部屋のほかのレーザーを再起動してください。

ほかの 3 本が復旧したら、**ここへ戻り、最後のビームを起動**しましょう。
<% } %>
