# 木の生存を確かめる

<div class="aside">
<h3>やること</h3>
<ul>
  <li><code>treeLifeDetector.js</code> を作成する。</li>
  <li>引数で数値 <code>0</code> が渡されたら <code>alive</code> を出力する。</li>
  <li>ほかの数値なら <code>other</code> を出力する。</li>
</ul>
</div>

ラボの西の橋を延ばす方法を探していると、この操作盤を発見しました。**樹木生命検知器**が故障したため、橋は無効になっているようです。

植物学者のところへ進むには、**樹木生命検知器を修理**する必要があります。

## 樹木生命検知器を修理する

コード用フォルダーに `treeLifeDetector.js` を作成します。プログラムは木の状態を示す `Number` を**コマンドライン引数**として 1 つ受け取ります。操作盤の横に、状態 ID と文字列の対応が掲示されています。

| 木の状態 ID | 木の状態 |
| --- | --- |
| 0 | "alive" |
| 1 | "other" |
| 2 | "other" |
| 3+ | "other" |

実行時に渡された ID に対応する文字列を、表にある英語のまま出力してください。

次のように実行すると、

```bash
node treeLifeDetector.js 0
```

`alive` が出力されます。

ほかの数値で次のように実行すると、

```bash
node treeLifeDetector.js 2
```

`other` が出力されます。

`treeLifeDetector.js` が仕様どおりに動いたら、*ハック*をクリックして修理結果を確認しましょう。
