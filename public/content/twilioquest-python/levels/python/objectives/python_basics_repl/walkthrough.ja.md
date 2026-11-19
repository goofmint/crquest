# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
January 28th, 2016

<hr/>

<p>伝説の「試行錯誤の試練」だ。古代の Python 使いたちは、プログラム全体を作らずコードをすぐ試せる REPL をいつも使っていた。試練に合格するには、この便利な道具を知っておく必要がある。</p>

<p>学習中、短い Python コードの結果をすぐ確認できるのがいい。便利な <code>help()</code> コマンドもある。さあ、自分も試練を受けよう。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>REPL は何に使う？</summary>

[REPL](https://pythonprogramminglanguage.com/repl/) はプログラムを一から作らなくてもコードを試せるツールです。数行だけ実行して挙動を確認したいときに便利です。

</details>

<details>
<summary>REPL を使うには？</summary>

Python をインストールすると REPL も使えるようになります。ターミナルで、引数を付けずに `python3` と入力してください。

<pre style="padding:5px;background-color:#232323;color:#eee;">python3</pre>

次のようなプロンプトが表示されます。

<pre style="padding:5px;background-color:#232323;color:#eee;">Python 3.7.4 (v3.7.4:e09359112e, Jul  8 2019, 14:54:52) 
[Clang 6.0 (clang-600.0.57)] on darwin
Type "help", "copyright", "credits" or "license" for more information.
>>> 
</pre>

Python コードを入力して Enter を押すと直接評価されます。たとえば `help()` を入力すると、Python の対話型ヘルプが開きます。

対話型ヘルプを開いた場合は、`help>` のプロンプトで `q` を入力し、Enter を押して `>>>` に戻ります。REPL を終了してターミナルに戻るには、次のコードを入力します。

```python
quit()
```

</details>

<details>
<summary>REPL を使って試練を終えるには？</summary>

REPL を開いて右側の質問に回答し、「ハック」を押して答えを確認しましょう。

</details>
