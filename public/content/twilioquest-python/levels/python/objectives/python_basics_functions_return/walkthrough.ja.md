# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
April 22nd, 2016

<hr/>

<p>古代の Python 使いの描画技術は、時代を先取りしていた。その工場ではパケットを処理し、クラウドの至る所で珍重された美術品を作ったという。</p>

<p>関数も似ている。原料（引数）を受け取り、処理（コードの実行）を行い、役に立つ結果を返せる。この試練でその方法を学ぶのだ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>関数から値を返すには？</summary>

呼び出し元に結果を渡すには `return` を使います。前の `hail_friend` をもとに、すぐ出力する代わりに `return` で文字列を返してみましょう。呼び出し元は結果を変数に格納し、あとで使えます。

```python
def hail_friend(name):
    message = f"Hail, {name}!"
    return message

greeting_one = hail_friend("Edward")
greeting_two = hail_friend("Alphonse")

print(greeting_one)
print(greeting_two)
```

関数の最後にある `return` が、処理の結果を呼び出し元に渡します。

</details>

<details>
<summary>試練を終えるには？</summary>

前に作った `functions.py` を開きます。必要なら下のフォルダーに作り直してください。

```bash
<%= env.TQ_PYTHON_CODE_PATH.value %>
```

整数の引数を二つ受け取り、和を返す関数 `add_numbers` を作ります。数値を足す処理は次のように書けます。

```python
result_sum = first_number + second_number
```

`functions.py` に書いた `add_numbers` が指定どおりに動いたら「ハック」を押してください。

</details>
