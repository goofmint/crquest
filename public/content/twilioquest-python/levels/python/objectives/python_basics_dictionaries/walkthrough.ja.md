# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
March 15th, 2016

<hr/>

<p>古代都市 Python では、学び方を学び、幅広い分野に触れる教養が重んじられた。彼らは人だけでなく、データにも多面的な表現を求めたようだ。</p>

<p>辞書を使うと、キーと値を組み合わせて、たとえばブログ記事の <code>title</code> と <code>author</code> を一つにまとめられる。<a href="https://docs.python.org/3/tutorial/classes.html">クラス</a>でも関連するデータをまとめられるが、それはまた別の機会に。辞書は手軽な方法だ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>辞書はどう作る？</summary>

[辞書](https://docs.python.org/3/tutorial/datastructures.html#dictionaries)を使うと、関連する項目をまとめられます。たとえば犬のプロフィールなら次のように書けます。

```python
dog = {
    'name' : 'Koto',
    'age' : 4,
    'color' : 'white',
    'fluffy' : True }

print(f"My dog's name is {dog['name']}")
```

辞書は `dog` に入ります。出力文ではキーを指定して、辞書に保存された値を取り出しています。`name` は `dog` にあるキーで、その値は `Koto` です。

</details>

<details>
<summary>試練を終えるには？</summary>

下のフォルダーに `dictionaries.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

`super_hero` という変数を宣言し、次の項目を含む辞書を格納します。

| キー | 値 | 値の型 |
| --- | --- | --- |
| name | `Miles Morales` | 文字列 |
| hero_name | `Spider-Man` | 文字列 |
| power_level | `9999` | 整数 |

`dictionaries.py` が指定どおりに動いたら「ハック」を押しましょう。

</details>
