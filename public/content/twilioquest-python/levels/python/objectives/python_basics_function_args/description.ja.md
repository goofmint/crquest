# 説得力のある引数の試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/functions.py</span></code>
</div>

前の課題の [関数](https://docs.python.org/3.7/tutorial/controlflow.html#defining-functions) `hail_friend` を拡張します。あいさつする相手の名前を入力として受け取れるように、引数を一つ追加してください。たとえば次のように呼び出します。

```python
hail_friend('Jonathan Joestar')
```

この場合は `Hail, Jonathan Joestar!` と英語のまま出力します。

準備ができたら「ハック」を押して、試練を完了しましょう。
