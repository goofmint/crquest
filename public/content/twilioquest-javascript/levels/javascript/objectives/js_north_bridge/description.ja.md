# はじめての条件分岐

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>northBridgeControl.js</code> を作成する。</li>
  <li>コマンドライン引数として文字列を受け取る。</li>
  <li>引数が <code>EXTEND</code> なら <code>Extending bridge!</code> を出力する。</li>
</ul>
</div>

植物へのダックタイピウムの影響を調べるため、植物学ラボはいくつもの温度管理された区画に分かれています。環境の混入を防ぐエネルギー橋が区画をつないでいます。

植物学者のところへ行くには、まずこの橋を復旧させましょう。

## 橋を延ばす

操作盤を調べると、起動処理が壊れています。橋を延ばすには、この処理を置き換える必要があります。

コード用フォルダーに `northBridgeControl.js` を作ってください。このプログラムはコマンドライン引数をひとつ受け取ります。引数が `EXTEND` なら、`console.log` で `Extending bridge!` を英語のまま出力します。`EXTEND` 以外の引数では何も出力しません。実行例です。

```bash
node northBridgeControl.js EXTEND
```

スクリプトの書き方は**ヘルプタブ**を参照してください。仕様どおりに動いたら、*ハック*をクリックしましょう！
