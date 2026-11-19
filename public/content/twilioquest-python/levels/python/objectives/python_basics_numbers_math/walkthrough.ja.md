# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
March 1st, 2016

<hr/>

<p>古代の Python 使いたちは、コンピューターに計算を任せて、大きな発想に集中した。その足跡をたどり、Python で計算する方法を学ばなければ。</p>

<p>この試練では四つの変数を宣言する。コマンドライン引数から数値を受け取り、Python の演算子で足し算、引き算、掛け算、割り算を行うのだ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>足し算や掛け算にはどの記号を使う？</summary>

[演算子の一覧](https://docs.python.org/3/library/operator.html#mapping-operators-to-functions)に記号がまとまっています。この試練で使う演算の例を見てみましょう。

```python
print(f"2 plus 2 equals { 2 + 2 }");
print(f"8 minus 4 equals { 8 - 4 }");
print(f"12 divided by 4 equals { 12 / 4 }");
print(f"11 times by 3 equals { 11 * 3 }");
```

</details>

<details>
<summary>試練を終えるには？</summary>

次のフォルダーに `numbers.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

コマンドライン引数の数値に四則演算を行い、結果を四つの変数に格納します。変数名は「目標」タブの表を参照してください。

```python
import sys

# This code reads in arguments and converts those inputs to decimal numbers
first_number = float(sys.argv[1])
second_number = float(sys.argv[2])

# Your code goes here!
result_sum = first_number + second_number

print(f"{first_number} plus {second_number} equals {result_sum}")
```

この例は `sys` モジュールを使って引数を読み、`first_number` と `second_number` に入れます。数値を渡して実行するには、次のコマンドを使います。

```bash
python3 numbers.py 12 4
```

このように実行して確かめたら、「ハック」を押してください。[計算は最高！](https://www.youtube.com/watch?v=FfPFtbJAEm8)

</details>
