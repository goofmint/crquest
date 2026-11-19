# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
April 10th, 2016

<hr/>

<p>Python の神殿は議論が盛んで、古代都市の公共生活の中心でもあった。説得力のある主張ひとつで歴史が変わることもあり、市民を志す者は主張し、相手の主張を受け止めることを学んだ。</p>

<p>関数はコードを再利用できるが、扱うデータに応じて動きを少し変えたいこともある。そのために引数がある。前の試練で作った関数が出発点になるが、入力を受け取れるように変更しなければ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>関数で引数を受け取るには？</summary>

コマンドライン引数と同じように、[関数の引数](https://docs.python.org/3.7/tutorial/controlflow.html#defining-functions)は処理に渡すデータです。

```python
def favorite_foods(firstFavorite, secondFavorite):
    print(f"My favorite foods are {firstFavorite} and {secondFavorite}.")

favorite_foods('tacos', 'pizza')
```

例では `favorite_foods` の括弧内に二つの変数名を書き、コンマ `,` で区切っています。[書式付き文字列](https://realpython.com/python-f-strings/)には `firstFavorite` と `secondFavorite` が差し込まれます。最後の行で文字列 `tacos` と `pizza` を渡すときもコンマ `,` で区切ります。

</details>

<details>
<summary>試練を終えるには？</summary>

前の試練で作った `functions.py` を開きます。削除した場合は下のフォルダーに作り直しましょう。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

相手の名前を一つ受け取る `hail_friend` を作り、名前に応じたあいさつを出力します。

```python
hail_friend('Jonathan Joestar')
```

上の呼び出しでは英語の `Hail, Jonathan Joestar!` を出力します。`functions.py` が指定どおりに動いたら「ハック」を押してください。

</details>
