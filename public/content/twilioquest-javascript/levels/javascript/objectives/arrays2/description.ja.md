# 配列の要素にアクセス

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>addFirstToLast.js</code> というファイルを作成する。</li>
  <li>ファイル内で、文字列の配列だけを引数に取る <code>addFirstToLast</code> 関数を定義する。</li>
  <li>入力配列の<b>最初</b>と<b>最後</b>の要素を連結して、結果を返す。</li>
  <li><em>ハック</em>をクリックして確認する。</li>
</ul>
</div>

エアロックの第 2 の隔壁は、別のセキュリティ障壁に阻まれています。積荷目録を処理する JavaScript 関数を直しましょう。この関数は文字列の配列を引数に取り、先頭と末尾の文字列をつなげた新しい文字列を返すものです。

**Infinite Loop** に入るには、この関数を正しく動くようにしなければなりません。

コード用フォルダーに `addFirstToLast.js` を作り、その中に同名の `addFirstToLast` 関数を定義してください。引数は 1 個の文字列配列です。

戻り値は、入力配列の先頭と末尾の要素を連結した文字列です。ひな型はヘルプタブにあります。

入出力例は次のとおりです。

| 入力 | 出力 |
| --- | --- |
| ['first', 'second', 'third'] | 'firstthird' |
| ['golden', 'terrier'] | 'goldenterrier' |
| ['cheerio'] | 'cheeriocheerio' |
| [ ] | '' |

以上の仕様どおりに配列を処理できたら、*ハック*をクリックして先に進みましょう。
