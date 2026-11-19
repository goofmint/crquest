# トレドの調査ノート

障壁のそばに、トレド・ヴァン・ポッサムの日誌が落ちています。

<blockquote>
January 24th, 2016

<hr/>

<p>予想どおりだ。儀式の間を進むには、古代の Python 使いが市民になる前に挑んだ試練を終えなければならない。</p>

<p>最初は、パソコンに Python をインストールするだけ。ダウンロードして何度かクリックし、<code>python3</code> のフルパスを貼り付ければいい。試練で書いたコードを端末から実行するのにも <code>python3</code> を使う。</p>

<p>--TVP</p>
</blockquote>

## ヒント

<details>
<summary>Python 3 の入手先は？</summary>

Windows なら [Windows Store](https://www.microsoft.com/en-us/p/python-37/9nj46sx7x90p) を推奨します。`python3` をシステムのパスに追加する処理も行われます。

ほかの OS では [python.org のダウンロードページ](https://www.python.org/downloads/)を参照してください。原文執筆当時の最新版は `3.7.4` でした。macOS では、画面の案内に沿って操作できるインストーラーを使えます。

</details>

<details>
<summary>「ターミナル」でコマンドを実行するには？</summary>

ターミナル（コマンドライン）とは、コマンドを入力してパソコンを操作するアプリです。Windows では [PowerShell](https://docs.microsoft.com/en-us/powershell/scripting/getting-started/getting-started-with-windows-powershell?view=powershell-6)、macOS では[ターミナル](https://support.apple.com/guide/terminal/welcome/mac)を使えます。Linux ではディストリビューションによってアプリが異なります。試練の Python コードはターミナルから実行します。

</details>

<details>
<summary>`python3` の場所を調べるには？</summary>

最初に、ターミナルで `python3` が使えることを確認します。

```bash
python3 --version
```

Python 3 のバージョンが表示されれば準備できています。macOS または Linux では次のコマンドで場所を確認します。

```bash
which python3
```

出力されたフルパスを右に貼り付け、「ハック」を押してください。インストーラーによっては `python3` の場所が次のようになります。

`/Library/Frameworks/Python.framework/Versions/3.7/bin/python3`

Windows では PowerShell で次を実行します。

```bash
 Get-Command python3.exe | Select-Object -ExpandProperty Definition
```

表示される `python3` 実行ファイルのフルパスは次のような形式です。

`C:\Users\susan\AppData\Local\Microsoft\WindowsApps\python3.exe`

python.org からインストールし、上のコマンドで見つからない場合は `python.exe` を探してください。パスを入力する前に、実行ファイルを `--version` 付きで実行して Python 3 であることを確かめます。

```bash
Get-Command python.exe | Select-Object -ExpandProperty Definition
```

</details>

<details>
<summary>Python 2 を入れている場合も Python 3 は必要？</summary>

TwilioQuest の課題は Python 3 を前提としています。[Python 2 と 3 には違い](https://www.fullstackpython.com/python-2-or-3.html)があり、課題に出てくる機能には Python 2 で動作しないものがあります。初めてなら Python 3 を学びましょう。

</details>
