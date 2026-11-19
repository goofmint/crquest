# コマンドライン引数を使う

この目標では[コマンドライン引数](https://nodejs.org/learn/command-line/accept-input-from-the-command-line-in-nodejs)を学びます。実行時に JavaScript コードに情報を渡すための仕組みです。

これまで、テストスクリプトは次のように実行してきました。

```bash
node someProgram.js
```

こうすると、書いたコードの指示どおりに処理が行われます。

プログラムに最初から何らかの値を渡したいことはよくあります。この値を**引数**と呼びます。引数付きでスクリプトを実行するには、コードのファイル名の後に、スペースで区切って値を並べます。引数を 3 つ渡す例です。

```bash
node someProgram.js "argument one" "another argument" allOneWordNoQuotes
```

コードの中では、[process.argv](https://nodejs.org/docs/latest/api/process.html#process_process_argv) という特別な配列からこの値にアクセスできます。

この目標では、コマンドライン引数を使うプログラムを書きます。最初は少し難しいので、次のコードをひな型にしてください。

```js
// The line of code below reads in the value of the argument passed in after
// the name of your script
const argumentValue = process.argv[2];

// This line of code converts the argument to a numeric value
const numberValue = Number(argumentValue);

// This line of code divides the input number by two, and stores the result in
// a variable named "result"
const result = numberValue / 2;

// You need to finish the line of code below! How would you print out the
// result to the terminal window without hard coding the number 42?
console.log(42);
```

コード用フォルダーの `divideByTwo.js` にこのコードを追加してください。フォルダーはここにあります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

最後の行を編集し、入力値を 2 で割った結果を出力するようにします。試すには、次のようにターミナルで実行してください。

```bash
node divideByTwo.js 400
```

正しければ実行結果は `200` になります。ひな型のままでは動作しないので、必ず変更してください！

期待どおりに動いたら、*ハック*をクリックしてください。

## 参考資料

* [Node.js のコマンドライン引数](https://nodejs.org/learn/command-line/accept-input-from-the-command-line-in-nodejs)
* [process.argv のリファレンス](https://nodejs.org/docs/latest/api/process.html#process_process_argv)
