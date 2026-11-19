# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
February 21st, 2016

<hr/>

<p>古代都市 Python では、名前は大切な意味を持ち、人や物の特徴を表すよう慎重に選ばれた。市民が書く Python コードでも同じことが期待された。</p>

<p>この試練では変数を二つ宣言する。変数はコードが扱うデータを入れるもので、名前を見ればどんなデータなのか読んだ人に伝わるようにする。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>ファイルの作成や実行方法を忘れたら？</summary>

終えた試練の障壁に近づいてスペースキーを押せば、前の試練を何度でも確認できます。このエリアの最初の課題で、Python コードの書き方と実行方法を復習しましょう。

</details>

<details>
<summary>変数とは？ どうやって作る？</summary>

[変数](https://www.w3schools.com/python/python_variables.asp)はプログラムで扱うデータを入れるものです。変数名に空白は使えません。複数の単語を区切るには `_` が使えます。たとえば「my awesome thing」なら `my_awesome_thing` と書きます。

変数の名前は（一定の規則の範囲で）自由に決められます。`=`（等号）で値を代入します。次のコードは数値 `777` を `lucky_number` に、文字列 `"Star Wars"` を `favorite_movie` に代入します。

```python
lucky_number = 777
favorite_movie = "Star Wars"

print(f"My luck number is {lucky_number}")
print(f"My favorite movie is {favorite_movie}")
```

</details>

<details>
<summary>試練を終えるには？</summary>

次のフォルダーに `variables.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

`favorite_robot` に文字列 `"Cedric"` を、`meaning_of_life` に数値 `42` を設定します。変数の宣言方法が分からなければ前のヒントを確認してください。準備ができたら「ハック」を押しましょう。

</details>
