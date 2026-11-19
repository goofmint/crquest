# 目標のヘルプ

TwilioQuest の JavaScript コードを保存するフォルダーを、コンピューターに作成してください。Mac なら Finder、Windows ならエクスプローラーといったツールや、コマンドラインを使えます。

作成したら、右の**フォルダーを選択**をクリックし、フォルダーを選びます。フルパスが入力欄に表示されます。ゲームはこの方法で選んだフォルダーを読み込めます。パスを貼り付けただけで権限エラーが出た場合は、ボタンから選び直してください。`quest` というフォルダーを作った場合、Mac のパスはたとえば次のようになります。

`/Users/jane/quest`

Windows のパスの例です。

`C:\Users\jane\quest`

## コマンドラインで作業用フォルダーを作る

Mac のターミナルと Windows の PowerShell では、次のコマンドで作業用フォルダーを作れます。1 行ずつ入力し、その都度 *Enter* を押して実行してください。`#` の後の文字はコマンドではなく、前のコマンドの説明です。

```bash
cd ~ # change directory to your home folder
mkdir quest # make a new folder called "quest"
cd quest # change directory to your new folder
pwd # print out the full path to the current folder
```

最後の `pwd` が、この目標で使うフルパスを表示します。
