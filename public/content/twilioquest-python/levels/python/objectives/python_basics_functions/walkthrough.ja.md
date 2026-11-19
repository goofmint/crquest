# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
April 4th, 2016

<hr/>

<p>神殿の弁論家は、困り果てた弟子たちからどんな理由で頼まれても、同じことを二度と繰り返さなかったそうだ。この試練にも効率を重んじる気質が表れている。</p>

<p>関数は再利用できるコードのまとまりだ。何度も同じ手順を書いているなら、ひとつの関数にまとめて呼び出せるようにするとよい。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>関数を定義するには？</summary>

[関数](https://docs.python.org/3.7/tutorial/controlflow.html#defining-functions)は名前を付けて再利用できるコードのまとまりです。たとえば、コンソールに出力する `print()` は Python の組み込み関数です。

```python
import sys

def print_name():
    print(f"Current script: {sys.argv[0]}")

print_name()
```

この例は実行中のスクリプト名を出力する `print_name` を定義します。最後の行で名前の後に括弧 `()` を付けて、関数を呼び出しています。

</details>

<details>
<summary>どの行が関数の中に入る？</summary>

Python はインデントでコードのまとまりを表します。関数の本文は一般にスペース四つ分下げ、同じ深さにそろえます。

```python
def print_lines():
    print("This will print first.")
    print("This will print second.")

print_lines()
```

インデントを戻すと、その行は関数の外に出ます。次の例の外側の行は関数を宣言した直後に実行されます。

```python
def print_lines():
    print("This will print second, and now our function has only one line.")
print("This will print first, and is no longer part of the function.")

print_lines()
```

</details>

<details>
<summary>試練を終えるには？</summary>

次の場所に `functions.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

英語の `Hail, friend!` を出力する関数 `hail_friend` を定義します。`functions.py` が指定どおりに動いたら「ハック」を押しましょう。

</details>
