# API とは？

[API](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Introduction#what_are_apis)（Application Programming Interface）は、他のプログラムの機能を呼び出す手段です。公開された `endpoints` にはそれぞれ別の機能が割り当てられ、各 `endpoint` に固有の URL（Uniform Resource Locator）と [メソッド](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) でアクセスできます。

## JSON とは？

[JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON)（JavaScript Object Notation）は、データを表現してやり取りする一般的な形式です。エンドポイントのレスポンスにもよく使われます。`fetch` で JSON を受け取ったら、使う前に JSON を [解析](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON#static_methods) し、プログラムで扱えるデータに変換します。

## 本のデータを取得して絞り込む

エンドポイントは `https://twilio.com/quest/magic/divination` です。情報を **取得** したいので、リクエストのメソッドには `GET` を使います。最初のコードは次のようになります。

```js
const response = await fetch("https://twilio.com/quest/magic/divination", {
  method: "GET",
});
const books = await response.json();
```

ここまでで本のデータを取得し、JSON を解析して変数に保存しました。`console.log(books);` を実行すると、次のようなデータが表示されます。

```json
[
  {
    "id": 1,
    "title": "Application Programming Interface Documentation: What Do Software Developers Want?",
    "yearPublished": 2017,
    "link": "https://sci-hub.ru/https://journals.sagepub.com/doi/abs/10.1177/0047281617721853",
    "author": {
      "name": "Michael Meng"
    },
    "metadata": {
      "pageCount": 36
    }
  },
  {
    "id": 2,
    "title": "Improving API Usability",
    "yearPublished": 2016,
    "link": "https://sci-hub.ru/https://dl.acm.org/doi/fullHtml/10.1145/2896587",
    "author": {
      "name": "Brad A. Myers"
    },
    "metadata": {
      "pageCount": 8
    }
  }
]
```

課題では、`pageCount` で指定されたページ数を超える本を書いた著者の名前を、配列で返します。まずは、ページ数で本を絞り込みましょう。

```js
const response = await fetch("https://twilio.com/quest/magic/divination", {
  method: "GET",
});
const books = await response.json();
const filteredBooks = books.filter((book) => {
  return book.metadata.pageCount > pageCount;
});
```

`filter` メソッドで `books` の内容を順に確認し、`pageCount` 以下の本を除き、結果を `filteredBooks` に保存します。次に、各本のデータを著者名だけに変換します。

```js
const response = await fetch("https://twilio.com/quest/magic/divination", {
  method: "GET",
});
const books = await response.json();
const filteredBooks = books.filter((book) => {
  return book.metadata.pageCount > pageCount;
});
const authorNames = filteredBooks.map((book) => {
  return book.author.name;
});
```

`map` 関数は、配列の各要素を順に変換できます。この例では、各本から `author.name` を取り出して新しい値にしています。`console.log(authorNames)` を実行すると、次のような結果が表示されます。

```json
["name1", "name2"]
```

あとは著者名を返せば完了です。ここまでをまとめると、次のようになります。

```js
async function getFilteredAuthors(pageCount) {
  const response = await fetch("https://twilio.com/quest/magic/divination", {
    method: "GET",
  });
  const books = await response.json();
  const filteredBooks = books.filter((book) => {
    return book.metadata.pageCount > pageCount;
  });
  const authorNames = filteredBooks.map((book) => {
    return book.author.name;
  });

  return authorNames;
}
```

## 参考リンク

- [MDN の HTTP メソッド](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [MDN の JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON)
- [MDN の Web API 入門](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Introduction#what_are_apis)
- [MDN の Array.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
- [MDN の Array.filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)
