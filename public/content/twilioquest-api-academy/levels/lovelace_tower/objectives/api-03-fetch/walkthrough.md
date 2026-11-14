# What is fetch?

Sometimes we want to get data or perform an action on another computer. One common way to do this is by visiting websites. When you enter the URL for a website in your web browser, the browser sends an HTTP request to the computer running the website, called the "server". The configuration of an HTTP request tells the server what to do with that request. Usually, when we visit a website from our browser, we send an HTTP GET request, which is a type of request that tells the server we want to "get" the website.

To send HTTP requests, Javascript provides the `fetch` method. `fetch` lets us configure and send HTTP requests, including those that would let us get the contents of a website from our code! When we send a request with `fetch`, just like in the browser, we use a [URL](https://developer.mozilla.org/en-US/docs/Web/API/URL).

## Using fetch

The `fetch` function takes two arguments, one is the URL that you're sending the request to and the other is the configuration. We'll be focussing on just a few of the configuration options here (the `method` option being among them), but there are [tons of others](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters) to play around with. The `method` option is one of the most important to set when making requests, because it often drastically changes the response you get. You can set `method` to any of these [HTTP Verbs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods), more on that coming up.

## What are HTTP Verbs?

HTTP Verbs (i.e. methods) represent the types of requests you can make. The most commonly used methods are `GET`, `POST`, `PATCH`, `PUT`, and `DELETE`.

- `GET` asks for some sort of data or information from the other device
- `POST` sends data to the other device
- `PUT` asks for something that exists already to be replaced entirely by the other device with what's being sent in the request
- `PATCH` asks for something that exists already to be updated by the other device using a set of instructions being sent in the request
- `DELETE` asks for something to be deleted by the other device

Some methods require additional data to be sent along with the request, while others do not. It's also important to note that all requests receive a response, and that it may also (just like GET) contain data. Try experimenting with them to get the hang of things! Now let's take a look at a couple of `fetch` examples:

```js
const response = await fetch("some_url", {
  method: "GET",
});

// const textData = await response.text();
// const jsonData = await response.json();

console.log(response);
```

Notice the `await` keyword here. The `fetch` function is asynchronous and must be awaited or passed a callback via promise chaining. The example is making a fetch request to a fake URL, but any valid URL would work! Also, pay attention to how we're configuring the request -- the second argument we're passing in is an object and our request uses [the properties](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters:~:text=A%20Request%20object.-,options,-Optional) of that object as the different parts of it's configuration. The example also has comments showing two ways you can parse the data received from the response, one for text and another for JSON. How you parse the response depends on the kind of data being sent to you.

```js
const response = await fetch("some_url", {
  method: "POST",
  body: "Hello World",
});

console.log(response);
```

This example is similar to the last, only now we're making a `POST` request with another option in our configuration object. This type of request is one that generally needs data to be sent along with it, and we accomplish that with the `body` property. The example is sending data (the "Hello World" string) to a server.

## Getting the magical phrase

When it comes to obtaining the magical phrase, it will be very similar to the previous example. We know `https://twilio.com/quest/magic` is the URL we want, and `GET` will be the method we use when `fetch`ing since we want to "get" the phrase. Now all that's left to do is write the code!

```js
async function getMagicalPhrase() {
  const response = await fetch("https://twilio.com/quest/magic", {
    method: "GET",
  });
  const magicalPhrase = await response.text();

  console.log(magicalPhrase);
}
```

And there you have it! With this, you should have the magical phrase you need for the input!

## Helpful resources

- [MDN URL](https://developer.mozilla.org/en-US/docs/Web/API/URL)
- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN HTTP Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [MDN Fetch Configuration](https://developer.mozilla.org/en-US/docs/Web/API/fetch#parameters:~:text=A%20Request%20object.-,options,-Optional)
