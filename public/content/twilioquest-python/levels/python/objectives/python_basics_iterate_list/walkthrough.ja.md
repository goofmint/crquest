# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
June 1st, 2016

<hr/>

<p>古代の Python 使いは、やることリストを驚くほど手際よく片づけた。今回の試練では、コードがリストを順に処理できることを示す必要がある。</p>

<p><a href="https://realpython.com/python-for-loop">for/in ループ</a>を使って、コマンドライン引数のリストの各要素に処理を行うつもりだ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>リストの要素すべてに処理を実行するには？</summary>

リストの各要素に同じ処理を実行することを**反復処理**と呼びます。[for/in ループ](https://realpython.com/python-for-loop/)を、前に使った買い物リストの例で見てみましょう。

```python
groceries = ['apples', 'coffee', 'pizza rolls', 'olives']

print("These are the items on my grocery list:")
for item in groceries:
    string_to_print = f"- {item}"
    print(string_to_print)
```

このコードでは四つの文字列を順に並べ、`for item in groceries:` と書いて `groceries` の要素を順に処理します。一回ごとに次の要素が `item` に入ります。

ループの本文は一般にスペース四つ分下げます。[インデント](https://docs.python.org/3/reference/lexical_analysis.html#indentation)がどの行を繰り返すかを Python に伝えます。

組み込み関数 [enumerate](https://docs.python.org/3/library/functions.html#enumerate) を使うと、要素と一緒に番号も取り出せます。

```python
groceries = ['apples', 'coffee', 'pizza rolls', 'olives']

print("These are the items on my grocery list:")
for index, item in enumerate(groceries, start=1):
    string_to_print = f"{index}. {item}"
    print(string_to_print)
```

この手法が今回も役立ちます。

</details>

<details>
<summary>試練を終えるには？</summary>

次のフォルダーに `list_iteration.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

次のコードを出発点にしましょう。コマンドライン引数からリスト `order_of_succession` を作ります。

```python
import sys

# Set up a list for our code to work with that omits the first CLI argument, 
# which is the name of our script (list_iteration.py)
order_of_succession = sys.argv
order_of_succession.pop(0)

# Now, order_of_succession is ready for us to work with
```

リストにある人の名前を順に出力し、先頭に継承順の番号を付けてください。「目標」タブに入出力例があります。すべての引数を処理できたら「ハック」を押しましょう。

</details>
