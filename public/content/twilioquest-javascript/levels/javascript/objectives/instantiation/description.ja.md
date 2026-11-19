# オブジェクトリテラル

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>construction.js</code> を作成する。</li>
  <li>文字列をひとつ受け取る <code>construct</code> 関数を作成する。</li>
  <li>下の仕様どおりにオブジェクトを返す。</li>
</ul>
</div>

ラボの北棟には、初めて見る不思議な装置があります。手前のコンソールを調べて、これが**物質実体化装置**の操作パネルだと分かりました。部屋の中央にある大きなチャンバーのことのようです！

ラボの爆発で損傷したらしく、コンソールはエラーログで埋まっています。このコンソールと同型のもう一台を復旧すれば、中央のチャンバーも動くはずです。

## オブジェクトリテラルを作成する

物質実体化装置は、何もないところから物を作り出せます！ この目標で修理する JavaScript 関数も、[オブジェクトリテラル記法](https://javascript.info/object#literals-and-properties)でオブジェクトを作ります。

コード用フォルダーに `construction.js` を作成します。中には、次のプロパティを持つ[オブジェクトリテラル](https://javascript.info/object#literals-and-properties)を返す `construct` 関数を定義してください。

| プロパティ | 型 | 値 | 注記 |
| --- | --- | --- | --- |
| name | string | 注記を参照 | `construct` 関数の最初の引数を使う |
| material | string | 'human' | |
| assemble | boolean | true | |
| duration | number | 1000 | |

プロパティ名と文字列の値は表の英語のままにしてください。仕様どおりに関数を書けたら、*ハック*をクリックしましょう。
