# 入力を受け取る試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/collect_input.py</span></code>
</div>

コマンドラインから渡された**最初の三つの引数を出力する** Python スクリプトを書きましょう。たとえば次のように実行します。

```bash
python3 collect_input.py apples oranges pears
```

この場合、出力は次のようになります。

```bash
apples
oranges
pears
```

先ほど作成したコード用フォルダー（`<%= env.TQ_PYTHON_CODE_PATH.value %>`）の `collect_input.py` にコードを書きます。書き方は「ヘルプ」を参照してください。

準備ができたら「ハック」を押して、試練を完了しましょう。
