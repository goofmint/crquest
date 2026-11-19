# ひっかけの試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/fizzbuzz.py</span></code>
</div>

**任意の個数のコマンドライン引数**を受け取るプログラムを書きましょう。引数は整数です。一つずつ調べ、次の規則で出力してください。

* 3 で割り切れる場合は `fizz`
* 5 で割り切れる場合は `buzz`
* 両方で割り切れる場合は `fizzbuzz`
* どれにも当てはまらなければ数値そのもの

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

`fizzbuzz.py` にコードを書きましょう。

準備ができたら「ハック」を押して、試練を完了しましょう。
