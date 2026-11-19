# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌があります。

<blockquote>
February 12th, 2016

<hr/>

<p>
「入力を受け取る試練」は、コードが扱う最初のデータを渡す方法を学ぶためのものだ。たいていプログラムは、入力を受け取り、計算などの処理を行い、何らかの結果を出力する。
</p>

<p>
今回の入力は、スクリプトの名前の後ろに入力する<b>コマンドライン引数</b>だ。出力は指定された表示文になる。そのために、標準ライブラリからモジュールを取り込み、引数を受け取り、その値を表示文に差し込む必要がある。
</p>

<p>--TVP</p>
</blockquote>

## ヒント

日誌に、コマンドライン引数を使うスクリプトの例があります。

```python
import sys

print(f"The name of this Python file is '{sys.argv[0]}'")
print(f"The first argument passed in to my script was: '{sys.argv[1]}'")
print(f"The second argument passed in to my script was: '{sys.argv[2]}'")
print(f"The third argument passed in to my script was: '{sys.argv[3]}'")
```

`collect_input.py` にこのコードを写し、次のように実行します。

```bash
python3 collect_input.py snacky yogurt "a long thing in quotes"
```

引数が順に表示されました。どうやらこれで解けたようです。重要な部分を見てみましょう。

## モジュールのインポート

まず次の行が実行されます。

```python
import sys
```

Python の標準ライブラリにあるモジュールを[読み込んでいます](https://docs.python.org/3/reference/import.html)。

* **モジュール**は、別の場所に書かれたコードを特定の用途で使えるようにしたものです。自分のコードを複数のファイルに分けたり、他の人が書いたコードを使ったりできます。組み込みの [sys](https://docs.python.org/3/library/sys.html) モジュールは引数の取得などに使えます。
* **インポート**では、`import` キーワードで別のモジュールのコードを読み込みます。[仕様](https://docs.python.org/3/reference/import.html)も参照できます。`sys` などの組み込みモジュールは、`import` の後ろに名前を書くだけで使えます。
* **標準ライブラリ**には Python に[標準で含まれるモジュール](https://docs.python.org/3/library/)があります。数値、日付、文字列などを扱う際に利用できます。

この試練では、`sys` を使ってスクリプトに渡された入力を取得します。

## コンソールに出力する

`print` は、コンソールに文字列などを出力する Python の[組み込み関数](https://docs.python.org/3/tutorial/inputoutput.html)です。関数とは、入力を変えながら何度でも呼び出せるコードのまとまりです。[print 関数](https://docs.python.org/3/library/functions.html#print)には表示したい情報を引数として渡します。

表示文には [f 文字列](https://docs.python.org/3/tutorial/inputoutput.html#tut-f-strings)を使っています。プログラムの値を文字列の中に差し込む書き方です。

## スクリプトの引数を読む

`sys.argv` は、スクリプト名を含めて `python3` に渡した引数を格納する文字列の[リスト](https://www.w3schools.com/python/python_lists.asp)です。

* `sys.argv[0]` はスクリプトの名前です。この例では「collect_input.py」です。
* `sys.argv[1]` はスクリプトの名前に続く最初の引数です。
* `sys.argv[200]` は 200 番目の引数です。引数が 200 個に満たなければ[エラー](https://docs.python.org/3/tutorial/errors.html)になるので注意しましょう。

## 試練を終える

`<%= env.TQ_PYTHON_CODE_PATH.value %>` フォルダーに `collect_input.py` を作り、トレドのコードを書きます。最初にターミナルで次を入力します。

```bash
cd "<%= env.TQ_PYTHON_CODE_PATH.value %>"
```

Python コード用フォルダーに[作業ディレクトリ](https://en.wikipedia.org/wiki/Working_directory)が変わります。まだ作っていなければ、ここに `collect_input.py` を作ります。macOS または Linux では次を入力します。

```bash
touch collect_input.py
```

Windows の PowerShell では次を入力します。

```bash
New-Item -ItemType file collect_input.py
```

VS Code などのエディターで開き、次のコードを `collect_input.py` に保存します。

```python
import sys

print(f"The name of this Python file is '{sys.argv[0]}'")
print(f"The first argument passed in to my script was: '{sys.argv[1]}'")
print(f"The second argument passed in to my script was: '{sys.argv[2]}'")
print(f"The third argument passed in to my script was: '{sys.argv[3]}'")
```

試しに引数を三つ渡して実行します。

```bash
python3 collect_input.py snacky yogurt "a long thing in quotes"
```

すべての引数がコンソールに表示されたら、右の「ハック」を押して試練を終えましょう。
