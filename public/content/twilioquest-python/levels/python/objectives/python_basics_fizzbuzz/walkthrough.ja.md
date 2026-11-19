# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
October 3rd, 2016

<hr/>

<p>10 月 3 日。</p>

<p>ついに悪名高い「ひっかけの試練」だ。プログラミングの基礎を試す正当な課題だと考える者もいれば、めったに使わない<a href="https://stackoverflow.com/questions/4432208/what-is-the-result-of-in-python">剰余演算子</a>を知らない者をひっかけていると考える者もいた。</p>

<p>いずれにせよ、FizzBuzz の実装は反復処理と条件分岐を組み合わせる練習になる。後の探検者が学べるように、ここに手順を記しておこう。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>処理全体の流れは？</summary>

まず擬似コードで手順を整理すると、本物のコードに落とし込みやすくなります。次は FizzBuzz を解く方法の一例です。

<pre>
inputs = list of all arguments to my script

for each input in the list, do the following:
    convert the input to a number
    set my print string equal to a blank/empty string
    if the number is divisible by 3, append "fizz" to the output string
    if the number is divisible by 5, append "buzz" to the output string
    if by now the output string is still blank, set it to the input number
    print the output string
</pre>

処理の流れが見えたら、実際の Python コードを考えていきましょう。

</details>

<details>
<summary>スクリプトに渡された引数を一覧にするには？</summary>

前の試練と同じく、`sys` モジュールから引数のリストを取得できます。最初の要素はプログラムの名前なので除きます。

```python
import sys

# Set up a list for our code to work with that omits the first CLI argument, 
# which is the name of our script (fizzbuzz.py)
inputs = sys.argv
inputs.pop(0)

# Now, inputs is ready for us to work with
```

</details>

<details>
<summary>文字列を整数に変換するには？</summary>

引数は初めは文字列です。計算には、[型変換](https://en.wikipedia.org/wiki/Type_conversion)で数値に直します。この課題では Python の[組み込み関数](https://www.w3schools.com/python/python_casting.asp) `int` を使います。

```python
number_string = "100"
number_converted = int(number_string)
print(f"100 minus 60 is {number_converted - 60}")
```

</details>

<details>
<summary>割り切れるかどうかを調べるには？</summary>

A を B で割った余りが 0 なら、A は B で割り切れます。`6` を `3` で割ると商は `2`、余りは 0 なので `6` は `3` で割り切れます。`7` を `3` で割ると商は `2`、余りは `1` なので `7` は `3` で割り切れません。

Python では余りを求める演算（`modulus` または `modulo`）に `%` を使います。

```python
rem1 = 6 % 3
rem2 = 7 % 3

print(f"The remainder after dividing 6 by 3 is {rem1}.")
print(f"The remainder after dividing 7 by 3 is {rem2}.")
```

`rem1` は `0`、`rem2` は `1` になります。つまり、`%` の結果がゼロかどうかを調べれば、割り切れるか分かります。

</details>

<details>
<summary>リストを順に処理して条件分岐するには？</summary>

どちらも以前の試練で扱いました。次のフォルダーにある `list_iteration.py`、`booleans.py`、`branching.py` を見直して組み合わせましょう。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

</details>

<details>
<summary>試練を終えるには？</summary>

ここに `fizzbuzz.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

コマンドライン引数を順に処理し、一つにつき一行出力します。

実行例

```bash
python3 fizzbuzz.py 30 200 7 6
```

出力例

```bash
fizzbuzz
buzz
7
fizz
```

* 3 のみで割り切れる場合は `fizz`
* 5 のみで割り切れる場合は `buzz`
* 3 と 5 の両方で割り切れる場合は `fizzbuzz`
* どれにも当てはまらない場合は数値そのもの

次のコードを使って引数のリストを準備できます。

```python
import sys

# Set up a list for our code to work with that omits the first CLI argument, 
# which is the name of our script (fizzbuzz.py)
inputs = sys.argv
inputs.pop(0)

# Process the "inputs" list as directed in your code
```

`fizzbuzz.py` が要件を満たしたら「ハック」を押しましょう。

</details>
