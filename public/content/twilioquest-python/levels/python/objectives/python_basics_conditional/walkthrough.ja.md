# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
August 21st, 2016

<hr/>

<p>入門の儀式の間の調査は続いている。最後の手がかりが本当にあるのか疑わしくなってきたが、ようやく分かれ道の試練に出会えた。真偽値と比較の知識を使って、複数の条件に応じて処理を切り替える方法を学ばなければ。</p>

<p>この部屋を出られたら、TwilioQuest 計画にはいつもの倍の報酬を請求するぞ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>複数の条件で分岐するには？</summary>

`if` は条件が成り立つ場合だけコードを実行します。条件が複数あるなら `elif` と `else` も使いましょう。

```python
dinner_name = "kale"

if dinner_name == "tacos":
    print("Tacos for dinner - right on!")
elif dinner_name == "pizza":
    print("Pizza - can't go wrong there!")
else:
    print("Okay - better than being hungry amirite?")
```

[比較演算](https://docs.python.org/3/library/stdtypes.html#comparisons)で各条件を調べます。`if` と `else` のブロックは一つずつですが、`elif` は必要なだけ置けます。`elif` の条件は順番に評価され、最初に `True` になったところで止まります。どの条件も成り立たない場合は `else` のブロックが実行されます。

</details>

<details>
<summary>文字列の引数を数値に変換するには？</summary>

`sys.argv` で取得した引数は文字列です。数として比べるには整数か小数に変換しておきましょう。以下は整数への変換例です。

```python
first_num = int(sys.argv[1])
second_num = int(sys.argv[2])
sum_to_use = first_num + second_num
```

</details>

<details>
<summary>試練を終えるには？</summary>

下のフォルダーに `branching.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

二つの整数をコマンドライン引数から取得し、足します。合計に応じて次の英語の文を出力します。

* 0 以下なら `You have chosen the path of destitution.`
* 1 以上 100 以下なら `You have chosen the path of plenty.`
* 100 より大きければ `You have chosen the path of excess.`

実行例

```bash
python3 branching.py 30 200
```

出力例

```bash
You have chosen the path of excess.
```

三つの条件に対応できたら「ハック」を押してください。

</details>
