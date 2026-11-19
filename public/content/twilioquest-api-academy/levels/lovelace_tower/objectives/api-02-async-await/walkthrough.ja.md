# コードを非同期に実行する

多くのコードはすぐ値を返しますが、時間がかかる処理もあります。その場合でも JavaScript は結果を待たず、後続のコードを実行します。後続の処理が、その結果を必要とすることもあります。

一例は、Node.js と JavaScript でディレクトリの中身を読み取る処理です。次のコードを見てください。

例 1

```js
const { readdir } = require("fs").promises;

const contents = readdir("path/to/directory");
console.log(contents);
```

この例は `readdir` でディレクトリの中のファイルやフォルダーを取得し、変数 `contents` に代入してコンソールに表示しようとしています。`readdir` の結果が返るまでには時間がかかり、JavaScript はその完了を待たないので、`console.log` では想定した値が表示されません。

このような関数を「非同期関数」と呼び、Promise を返します。このとき `console.log` には `Promise { <pending> }` と表示されます。

`readdir` は非同期関数で、完了までに時間がかかります。この状態のままでは `console.log` に `Promise { <pending> }` と表示されます。そこで Promise が役立ちます。

## Promise とは？

Promise は、将来受け取る値を表します。非同期関数は最初に Promise オブジェクトを返し、値が用意されると Promise が「解決」して、その値を取り出せます。将来値を渡すという **約束** です。

JavaScript では、Promise を使ってプログラムの実行順序を制御できます。処理が終わるまで待つには `await` キーワード、処理の完了時にコールバック関数を呼び出すには `promise.then` メソッドを使います。順に見ていきましょう。

## Promise をつなげる

`promise.then` に関数を渡すと、非同期処理が終わったあとに呼び出せます。`promise.then` は Promise を返すので、順に呼び出しをつなげられます。

例 2

```js
const { readdir } = require("fs").promises;

readdir("path/to/directory")
  .then((content) => {
    console.log("First:", content);
  })
  .then((content) => {
    console.log("Second:", content);
  });
```

この例では、Promise をつなげて非同期処理の結果を扱っています。この方法では非同期処理が終わるまでの間も、残りのコードは実行されます。コールバックの入れ子が深くなる [ピラミッド・オブ・ドゥーム](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#:~:text=the%20classic%20callback-,pyramid%20of%20doom,-%3A) にも注意しましょう。コードが読みにくくなる原因です。

## Promise の解決を待つ

`await` キーワードを使うと、処理が終わって結果が返るまで、その関数の実行を一時停止できます。

例 3

```js
const { readdir } = require("fs").promises;

const contents = await readdir("path/to/directory");
console.log(contents);
```

この例では、非同期処理の完了を待ちます。上の Promise をつなげる例とは違い、`readdir` が完了するまで、この関数の処理は先に進みません。

## ディレクトリの最後のファイルを見つける

非同期処理の扱い方が分かったので、もう一度課題を見ましょう。`findLastFileInDir` 関数は `dirPath` 引数を 1 つ受け取ります。次のように、その引数を `readdir` メソッドと `await` キーワードと組み合わせれば、ディレクトリ内の項目をすべて取得できます。

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
}
```

この時点で、`allFiles` には `dirPath` で指定したディレクトリにあるすべてのファイルの配列が入っています。目標は、`allFiles` の **最後** のファイルを取り出すことです。例えば、次のように書けます。

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
  const lastFile = allFiles[allFiles.length - 1];
}
```

配列 `allFiles` から、`allFiles.length - 1` 番目の要素を取り出しています。添字は 0 から始まるため、最後の要素の添字はファイル数から 1 を引いた値です。あとは `lastFile` を返すだけです！

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
  const lastFile = allFiles[allFiles.length - 1];

  return lastFile;
}
```

これでディレクトリ内のファイルをすべて取得し、そのうち最後の 1 件を返す関数が完成します。

## 参考リンク

- [MDN の JavaScript イベントループ](https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)
- [MDN の非同期 JavaScript](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing)
- [MDN の JavaScript Promise](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing)
- [MDN の Promise チェーン](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises#chaining_promises)
- [MDN のピラミッド・オブ・ドゥーム](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#:~:text=the%20classic%20callback-,pyramid%20of%20doom,-%3A)
