# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
February 1st, 2016

<hr/>

<p>市民の試練の初めに「あいさつの試練」があるのも納得だ。「Hello World」は、短いメッセージを表示してみるプログラミングの定番だ。古代の Python 使いは伝統のあいさつ「For the glory of Python!」を表示した。</p>

<p>大事なのは、この先の試練で書く Python コードを置くフォルダーを作ることだ。今は簡単なあいさつだが、この先は難しくなりそうだ。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>Windows の PowerShell でフォルダーを作るには？</summary>

Windows のエクスプローラーで作っても構いません。コマンドで作る場合は PowerShell を起動し、次のコマンドを入力します。

```bash
cd ~
```

`cd` は、エクスプローラーでフォルダーを開くように、端末の作業フォルダーを変更します。`~`（チルダ）を指定するとホームフォルダーに移動します。

```bash
mkdir quest
```

これでホームフォルダーに `quest` ができました。次のコマンドで移動すると、ここで試練のコードを作成して実行できます。

```bash
cd quest
```

</details>

<details>
<summary>Mac のターミナルでフォルダーを作るには？</summary>

Finder で作っても構いません。コマンドで作る場合は「アプリケーション」→「ユーティリティ」からターミナルを開きます。

```bash
cd ~
```

`cd` は現在の作業フォルダーを変更するコマンドです。`~`（チルダ）を指定するとホームフォルダーに移動します。

```bash
mkdir quest
```

これでホームフォルダーに `quest` ができました。次のコマンドで移動すると、ここで試練のコードを作成して実行できます。

```bash
cd quest
```

</details>

<details>
<summary>Python のファイルを作るには？</summary>

前の手順の `cd` でコード用フォルダーに移動してからファイルを作ります。

```bash
cd ~/quest
```

`pwd` で現在の場所を確かめられます。

```bash
pwd
```

試練で指定されたファイル名は `salutation.py` です。Windows の PowerShell では次のように作ります。

```bash
New-Item -ItemType file salutation.py
```

macOS または Linux では次のコマンドを使います。

```bash
touch salutation.py
```

Python のソースファイルには `.py` の拡張子が付きます。Word 文書の `.docx` や音声ファイルの `.mp3` と同じように種類を表します。

</details>

<details>
<summary>Python ファイルを編集するには？</summary>

コードはテキストエディターで編集します。使い慣れたエディターで構いません。どれか選ぶなら、各 OS で利用できる無料の [Visual Studio Code](https://code.visualstudio.com/)（VS Code）があります。[Visual Studio](https://visualstudio.microsoft.com/) は別の製品で、多機能な[統合開発環境（IDE）](https://en.wikipedia.org/wiki/Integrated_development_environment)です。

### VS Code でコード用フォルダーを開く

VS Code の「File」→「Open...」を選び、ソースファイル単体ではなく、先ほど作ったフォルダーを開きます。画面のファイル一覧から `salutation.py` を選んで編集します。

![VS Code のファイル一覧](images/python/vscode.png)

次のコードを入力します。

```python
# Your first line of Python code is below!
print("For the glory of Python!")
```

![VS Code で開いたコード](images/python/hello.png)

「File」→「Save」で保存してください。

</details>

<details>
<summary>行の先頭にある「#」は何？</summary>

このような行はコメントです。Python の実行時には処理されません。コードが何をするのか、あとで読む人や自分が分かるように説明を残せます。

</details>

<details>
<summary>Python コードを実行するには？</summary>

ターミナルの作業フォルダーをコード用フォルダーに変更します。このチュートリアルどおりなら、次のコマンドで移動できます。

```bash
cd ~/quest
```

`python3` を使える環境では、書いたファイルを次のように実行します。

```bash
python3 salutation.py
```

インストールの試練で Windows の `python.exe` を指定した場合は、PowerShell で次のように実行します。

```powershell
python salutation.py
```

コマンドが見つからなければ、その試練で確認した実行ファイルのフルパスを使います。例のパスを置き換え、引用符と PowerShell の呼び出し演算子 `&` はそのまま残してください。

```powershell
& "C:\Program Files\Python313\python.exe" salutation.py
```

正しく動けば、ターミナルに英語の「For the glory of Python!」が出ます。この先の試練でも、このようにメッセージを表示することがあります。

</details>

<details>
<summary>コードが動いたら試練をどう終える？</summary>

右の入力欄にファイルのフルパスを入れます。この手順で作った場合、Windows では次のような場所になります。

```bash
C:\Users\susan\quest\salutation.py
```

macOS では次のような場所になります。

```bash
/Users/susan/quest/salutation.py
```

パスを貼り付けて「ハック」を押しましょう。コードを検証し、次の試練で使う**フォルダー**の場所を保存します。

</details>
