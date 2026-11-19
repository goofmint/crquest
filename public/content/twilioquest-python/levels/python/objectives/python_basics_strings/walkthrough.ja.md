# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
March 3rd, 2016

<hr/>

<p>古代都市 Python の思想家や哲学者が残した言葉は、時代を超えて伝わった。この試練では、未来の Python 開発者も言葉を効果的に使う方法を学ぶ。</p>

<p>今回は入力文字列を<b>思いっきり盛り上げる!!!</b>コードを書く。これまでにも何度か使ったが、文字列は文字の並びを表す Python の組み込みオブジェクトだ。開発では文字の操作がよくあるので、試練に含まれるのも納得だ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>入力文字列はどう取得する？</summary>

次のコードを出発点にできます。これまでと同様、`sys` モジュールを使ってコマンドライン引数から文字列を読み取ります。

```python
import sys

# Read in an input string passed in to our script as an argument
input_string = sys.argv[1]
output_string = input_string

# Now, print your transformed string:
print(output_string)
```

次のように実行します。

```bash
python3 strings.py "am I stoked enough yet"
```

このコードは受け取った文字列をそのまま出力します。変換する処理を追加するのが今回の課題です。

</details>

<details>
<summary>Python で文字列を変換するには？</summary>

Python の文字列は**変更できない**ので、元の文字列をもとに新しい文字列を作ります。[文字列オブジェクト](https://docs.python.org/3/library/stdtypes.html#string-methods)には、そのためのメソッドがいろいろあります。メソッドとは、特定のオブジェクトに対して処理する関数（`print` などと同じように呼び出せるもの）です。この場合は [upper](https://docs.python.org/3/library/stdtypes.html#str.upper) が役立ちます。

```python
new_string = "get stoked".upper()
print(new_string)
```

文字列をつなぐ方法の一つが `+` 演算子です。数値なら加算ですが、文字列に使うと結合します。たとえば `The NY Mets are my favorite squadron.` を作れます。

```python
part_one = "The NY Mets "
part_two = "are my favorite squadron."

full_message = part_one + part_two
print(full_message)
```

</details>

<details>
<summary>試練を終えるには？</summary>

次のフォルダーに `strings.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

コマンドライン引数の文字列を受け取り、二つの変換を行います。次のコードを出発点にできます。

```python
import sys

# Read in an input string passed in to our script as an argument
input_string = sys.argv[1]
output_string = input_string

# Now, print your transformed string:
print(output_string)
```

入力を**すべて大文字にし、感嘆符を三つ付けて**コンソールに出力するように変更しましょう。次のコマンドで確認できます。

```bash
python3 strings.py "am I stoked enough yet"
```

正しく動けば `AM I STOKED ENOUGH YET!!!` と表示されます。`strings.py` が指定どおりに動いたら「ハック」を押してください。

</details>
