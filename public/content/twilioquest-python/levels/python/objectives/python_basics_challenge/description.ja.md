# 思いがけない挑戦

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/citizen.py</span></code>
</div>

古代都市 Python の市民を表す [Python クラス](https://docs.python.org/3/tutorial/classes.html)を作りましょう。クラス名は `Citizen` です。次のデータと処理を用意します。

* クラスを説明する **docstring**
* 文字列の引数 `first_name` と `last_name` を受け取り、インスタンス変数に代入する **init メソッド**
* 姓名のインスタンス変数を空白一つでつないだ文字列を返すインスタンスメソッド `full_name`
* 英語の文字列 `For the glory of Python!` を値に持つクラス変数 `greeting`

`citizen.py` にこの条件を満たすクラスを書きましょう。

準備ができたら「ハック」を押して、試練を完了しましょう。
