# 分かれ道の試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/branching.py</span></code>
</div>

**コマンドライン引数を二つ**受け取るプログラムを書きましょう。引数はどちらも整数で、二つを足し合わせた結果によって、次のメッセージを英語のまま出力します。

* 合計が 0 以下なら `You have chosen the path of destitution.`
* 合計が 1 以上 100 以下なら `You have chosen the path of plenty.`
* 合計が 100 より大きければ `You have chosen the path of excess.`

実行例

```bash
python3 branching.py 30 200
```

出力例

```bash
You have chosen the path of excess.
```

準備ができたら「ハック」を押して、試練を完了しましょう。
