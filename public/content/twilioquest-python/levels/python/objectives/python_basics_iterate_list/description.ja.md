# 反復処理の試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/list_iteration.py</span></code>
</div>

**任意の個数のコマンドライン引数**を受け取るスクリプトを書いてください。古代都市 Python の指導者の名前が、継承順に引数として渡されます。

すべての名前の**前に継承順の番号を付けて**出力しましょう。たとえば、次のように実行します。

```bash
python3 list_iteration.py Deak Windy Luke Biggs
```

出力は次の形式です。名前は受け取ったとおりに表示します。

```bash
1. Deak
2. Windy
3. Luke
4. Biggs
```

準備ができたら「ハック」を押して、試練を完了しましょう。
