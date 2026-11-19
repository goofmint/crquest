# セドリックが扉を通れるようにしよう

<div class="aside">
<h3>要件</h3>
<ul>
  <li>単語を正しい順番で入力します。</li>
  <li>終わったら <em>ハック</em> を押します。</li>
</ul>
</div>

セドリックはダークダックティピウムの胸当てを探して神殿を探索してきましたが、まだ見つかっていません。O.W.L.（Object Waypoint Locator）ユニットの案内でこの部屋に来たものの、扉が行く手を阻んでいます。扉にはいくつかの単語と記号が彫られています。地形をスキャンして得られた結果は、次のとおりです。

`skrept` = `door = open`
`jah` = `if`
`vuh` = `lever === pulled`

セドリックが先へ進めるように、単語を正しい順番に並べて入力してください。使える単語は `skrept`、`jah`、`vuh` です。

<% const imagePath = await resolveAbsolutePath("images/challenge-questions/turtle2_x4.png") %>

![セドリックがいる部屋](<%= imagePath %>)

単語を入力したら、_ハック_ ボタンをクリックしてください！
