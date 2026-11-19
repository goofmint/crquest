# 真偽の試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/booleans.py</span></code>
</div>

[真偽値](https://docs.python.org/3/library/stdtypes.html#truth-value-testing)を持つ変数を宣言するプログラムを作りましょう。次の名前と値をそのまま使います。

* 変数 `python_is_glorious` を `True` に設定します。
* 変数 `failure_is_option` を `False` に設定します。
* 変数 `proper_greeting` の初期値を `False` にします。

スクリプトの最初の引数が英語の文字列 `For the glory of Python!` と完全に一致した場合は、`proper_greeting` を `True` に変更してください。

準備ができたら「ハック」を押して、試練を完了しましょう。
