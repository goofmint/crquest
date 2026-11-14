# What is an API?

[APIs](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Introduction#what_are_apis) (Application Programming Interface) provide a way to interact with other computer programs. They do so by publicly exposing `endpoints`, with each `endpoint` representing a different service, and made accessible via a unique URL (Uniform Resource Locator) and [method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods).

## What is JSON?

[JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON) (Javascript Object Notation) is a common format used to represent and exchange data, and is often used when making requests to endpoints that provide information in their response. It's important to note that when using `fetch` and receiving JSON, we must [parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON#static_methods) (i.e. have the computer anylize) the JSON data before using it.

## Getting and filtering the books

Firstly, we know the endpoint is `https://twilio.com/quest/magic/divination`, so that's where we'll send our request to. We're specifically **asking** for information to be sent to us, so we'll use `GET` as the request method. Our starter code should end up looking something like this:

```js
const response = await fetch("https://twilio.com/quest/magic/divination", {
  method: "GET",
});
const books = await response.json();
```

At this point, we've requested the books, parsed the JSON, and stored it in a variable. If you `console.log(books);`, you should see something along the lines of:

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

The objective asks for a filtered array of the names of authors that have written more than a certain number (specified by the `pageCount` argument) of pages. Let's start by filtering the books by the number of pages written:

```js
const response = await fetch("https://twilio.com/quest/magic/divination", {
  method: "GET",
});
const books = await response.json();
const filteredBooks = books.filter((book) => {
  return book.metadata.pageCount > pageCount;
});
```

We use the `filter` method to go through all of the `books` and remove those which don't have more pages than what's specified by `pageCount`, then store the result in our `filteredBooks` variable. Now let's replace each book with just the name of it's author.

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

The `map` function allows us to change each element in an array one by one. Here, we're getting the `author.name` of each book and using that as the new value. If you were to run `console.log(authorNames)`, you would see something similar to:

```json
["name1", "name2"]
```

The only thing left to do now is return the author names, and we're good to go! Altogether, that should look something like this:

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

## Helpful links

- [MDN HTTP Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [MDN JSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON)
- [MDN Introduction to Web APIs](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Client-side_web_APIs/Introduction#what_are_apis)
- [MDN Array.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
- [MDN Array.filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)
