# 言葉の試練

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
  <code><span><%= env.TQ_PYTHON_CODE_PATH.value %>/strings.py</span></code>
</div>

スクリプトの最初のコマンドライン引数として受け取った文字列を、次のように変換してください。

* **すべて大文字**にする
* 末尾に**感嘆符を三つ**付ける

変換した文字列をコンソールに出力します。たとえば `i love puppies` を受け取ったら、`I LOVE PUPPIES!!!` と出力してください。

準備ができたら「ハック」を押して、試練を完了しましょう。
