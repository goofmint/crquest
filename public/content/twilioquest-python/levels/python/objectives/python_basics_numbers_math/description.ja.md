# 数の試練

<style>
.py-script-info {
  font-size: 16px;
  text-align: center;
  background-color: #FFFFE0;
  border: 2px solid #F0E68C;
  padding: 5px;
  line-height: 1.5em;
  margin: 5px 0;
  font-style: italic;
}

.py-script-info span {
  font-style: normal;
  color: #000;
}
</style>

<div class="py-script-info">
  先ほど作成したフォルダーに、<b>次の名前</b>で Python ファイルを保存してください。
  <br/>
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/numbers.py</span></code>
</div>

コマンドライン引数で受け取った二つの数に演算を行い、結果を格納する**四つの変数**を宣言します。次のコードを出発点にしましょう。

```python
import sys

# This code reads in arguments and converts those inputs to decimal numbers
first_number = float(sys.argv[1])
second_number = float(sys.argv[2])

# Your code goes here!
result_sum = first_number + second_number

print(f"{first_number} plus {second_number} equals {result_sum}")
```

用意する変数は次のとおりです。

| 変数名 | 内容 |
| --- | --- |
| `result_sum` | `first_number` と `second_number` の和。上の例ですでに宣言されています。 |
| `result_difference` | `first_number` から `second_number` を引いた結果。 |
| `result_product` | `first_number` と `second_number` の積。 |
| `result_quotient` | `first_number` を `second_number` で割った結果。 |

準備ができたら「ハック」を押して、試練を完了しましょう。
