# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
July 10th, 2016

<hr/>

<p>古代の Python 使いは科学と査読で客観的な真実を知ることができると考えた。この価値観を伝えるため、市民の試練に「真偽の試練」を入れたらしい。</p>

<p>今回扱うのは<a href="https://docs.python.org/3/library/stdtypes.html#truth-value-testing">真偽値</a>だ。英語の「Boolean」は、声に出すとなんだか面白い。真と偽を表せば、たとえばログイン済みの利用者には残高を表示し、まだの人にはログイン画面を出す、といった切り替えができる。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>真偽値の変数はどう作る？</summary>

値に `True` または `False` をそのまま代入します。先頭の文字は大文字です。

```python
tacos_rule = True
root_canal_fun = False
```

</details>

<details>
<summary>条件が成り立つときだけ実行するには？</summary>

if 文で、条件が成り立つときだけ実行するコードを指定できます。

```python
tacos_rule = True

if tacos_rule:
    print("Well, of course tacos rule!")
```

[比較演算](https://docs.python.org/3/library/stdtypes.html#comparisons)の結果は `True` か `False` です。次の例では、値が等しくないことを調べる演算子 `!=` で、メッセージを表示するか決めます。

```python
dinner_name = "kale"

if dinner_name != "tacos":
    print("Why aren't we eating tacos?")
```

</details>

<details>
<summary>試練を終えるには？</summary>

下のフォルダーに `booleans.py` を作ります。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

[真偽値](https://docs.python.org/3/library/stdtypes.html#truth-value-testing)の変数を次のように宣言します。

* `python_is_glorious` は `True`
* `failure_is_option` は `False`
* `proper_greeting` の初期値は `False`

最初の引数 `sys.argv[1]` が英語の文字列 `For the glory of Python!` なら、`proper_greeting` に `True` を代入します。たとえば次の実行で `proper_greeting` が `True` になります。

```bash
python3 booleans.py 'For the glory of Python!'
```

ほかの入力なら `proper_greeting` は `False` のままにします。書けたら「ハック」を押しましょう。

</details>
