# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
April 4th, 2016

<hr/>

<p>指導者の継承をめぐる内紛が続いた末、古代都市 Python は厳格な継承順を定めた。順序のある一覧は多くの社会で重要なので、市民を目指す者にもこの試練が課された。</p>

<p>Python のリストには、文字列や数値、さらに複雑なデータなどを順序付きで入れられる。試練を終えるには、リストの作り方と使い方を覚えなければ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>リストはどう作る？</summary>

Python の[リスト](https://docs.python.org/3/tutorial/datastructures.html)の例として、買い物リストを作ってみましょう。

```python
groceries = ['apples', 'coffee', 'pizza rolls', 'olives']

print(f"The first item on my grocery list is {groceries[0]}")
print(f"The last item on my grocery list is {groceries[3]}")
```

四つの文字列が順に並びます。それぞれの要素には、位置を表す番号（インデックス）があります。先頭は `0` なので、四つの要素がある場合、末尾は `3` です。

角括弧 `[]` に番号を書くと要素を取り出せます。`first_item = groceries[0]` では先頭の文字列 `apples` を `first_item` に格納します。

一つのリストに異なる種類のデータを混ぜることもできます。

```python
stuff = ['apples', {'favoriteMovieName': 'Star Wars'}, 42, True]

print(f"My favorite movie is {stuff[1]['favoriteMovieName']}")
```

</details>

<details>
<summary>試練を終えるには？</summary>

次のフォルダーに `lists.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

古代都市の継承順に名前を並べたリスト `order_of_succession` を作りましょう。順に `Isabelle`、`Grace`、`Charlotte`、`LeBron`、`Steve` です。

`order_of_succession` を作成できたら「ハック」を押してください。

</details>
