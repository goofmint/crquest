# fetch とは？

別のコンピューターからデータを取得したり、そこで何かを実行したりしたい場合があります。身近な例はウェブサイトの閲覧です。ブラウザーにサイトの URL を入力すると、ブラウザーはサイトを提供する「サーバー」に HTTP リクエストを送ります。サーバーはリクエストの設定に従って処理します。ブラウザーでウェブサイトを開くときは通常、サイトを取得するよう求める HTTP GET リクエストを送ります。

JavaScript で HTTP リクエストを送るには `fetch` メソッドを使います。`fetch` ではリクエストを設定して送信でき、コード内からウェブサイトの内容を取得することもできます。`fetch` でリクエストを送るときも、ブラウザーと同様に [URL](https://developer.mozilla.org/en-US/docs/Web/API/URL) を指定します。

## fetch の使い方

`fetch` は、送信先の URL と設定の二つを引数に取ります。ここでは `method` など、設定の一部を扱いますが、[ほかにもたくさんのオプション](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters) があります。`method` はレスポンスを大きく変えるため、とりわけ重要です。`method` に指定できる [HTTP メソッド](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) を見ていきましょう。

## HTTP メソッドとは？

HTTP メソッドは、リクエストで要求する処理の種類を表します。よく使うのは `GET`、`POST`、`PATCH`、`PUT`、`DELETE` です。

- `GET` は、相手のコンピューターからデータや情報を取得します。
- `POST` は、相手のコンピューターにデータを送ります。
- `PUT` は、既存のリソース全体を、リクエストで渡した内容に置き換えるよう求めます。
- `PATCH` は、リクエストで渡した指示に従い、既存のリソースを更新するよう求めます。
- `DELETE` は、リソースの削除を求めます。

メソッドによっては、リクエストと一緒にデータを渡す必要があります。どのリクエストにもレスポンスがあり、GET と同じようにデータが含まれることもあります。試しながら違いに慣れていきましょう。`fetch` の例を二つ紹介します。

```js
const response = await fetch("some_url", {
  method: "GET",
});

// const textData = await response.text();
// const jsonData = await response.json();

console.log(response);
```

`await` キーワードに注目してください。`fetch` は非同期関数なので、完了を待つか、Promise チェーンでコールバックを渡します。例では架空の URL にリクエストを送っていますが、実際には有効な URL を指定します。第 2 引数は設定オブジェクトです。各 [プロパティ](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters:~:text=A%20Request%20object.-,options,-Optional) がリクエストの動作を指定します。例のコメントでは、レスポンスをテキストとして読む方法と JSON として解析する方法を示しています。どちらを使うかは、返されるデータの種類で決まります。

```js
const response = await fetch("some_url", {
  method: "POST",
  body: "Hello World",
});

console.log(response);
```

次は、設定オブジェクトに別のオプションを指定し、`POST` リクエストを送る例です。このメソッドでは通常、送信するデータを `body` プロパティに指定します。ここでは「Hello World」という文字列をサーバーへ送ります。

## 魔法の言葉を取得する

魔法の言葉を取得する手順は、先ほどの例とよく似ています。目的の URL は `https://twilio.com/quest/magic` です。言葉を取得するので、メソッドは `GET` を指定して `fetch` します。あとはコードを書くだけです！

```js
async function getMagicalPhrase() {
  const response = await fetch("https://twilio.com/quest/magic", {
    method: "GET",
  });
  const magicalPhrase = await response.text();

  console.log(magicalPhrase);
}
```

関数を定義したら、`getMagicalPhrase()` を呼び出します。コンソールに表示された英語の文字列をそのまま入力欄にコピーしてください。

## 参考資料

- [MDN の URL](https://developer.mozilla.org/en-US/docs/Web/API/URL)
- [MDN の Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN の HTTP メソッド](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [MDN の fetch の設定](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters:~:text=A%20Request%20object.-,options,-Optional)
