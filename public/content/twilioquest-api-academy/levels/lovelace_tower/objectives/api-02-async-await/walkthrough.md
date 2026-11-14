# Running code asynchronously

Most of the code we write returns a value instantly\*, but there are times when it takes longer than usual. When this happens, Javascript doesn't wait: it will keep executing the rest of our code, even if that code depends on the value we are waiting to be returned!

An example of this is reading the contents of a directory using NodeJS and Javascript. Take a look at this code:

Example(1):

```js
const { readdir } = require("fs").promises;

const contents = readdir("path/to/directory");
console.log(contents);
```

The example uses `readdir` to get files and folders in a directory, and assigns those files and folders to a variable `contents`, and then outputs those contents to the console. Because `readdir` takes time to return a value, and Javascript doesn't wait, our `console.log` may not output what we expect.

We call functions like this "asynchronous", and they return a Promise. In this case, our `console.log` would print `Promise { <pending> }`.

The `readdir` function is asynchronous and will take some time to finish. With things as they are, our `console.log` would print `Promise { <pending> }`. That's where promises come into the picture.

## What are promises?

Promises represent a value that we will get in the future. Initially, an asynchronous function returns a Promise object, and when the real value is available, the Promise "resolves" and is replaced by the value. In other words, they are a **promise** of a future value! Get it?

Javascript can use the presence of a Promise to control the execution of our program, giving us the ability to pause it until a task completes, or provide a callback (i.e. a function) to be invoked once finished. To do so, we use the `await` keyword and `promise.then` method respectively. More on those coming up.

## Chaining promises

We can use the `promise.then` method to pass in a function to be called once an asynchronous task is done. Since the `promise.then` method returns the promise it belongs to, we're able to chain them together -- one after another.

Example(2):

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

The example shows how we might use promise chaining to do something with the result of an asynchronous task. It's important to note, that this approach allows our code to continue running until the asynchronous operation is done. Something else to consider is the [pyramid of doom](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#:~:text=the%20classic%20callback-,pyramid%20of%20doom,-%3A), which can make reading and understanding our code much harder.

## Awaiting promises

We can use the `await` keyword to pause our program until a task completes and gives us the result.

Example(3):

```js
const { readdir } = require("fs").promises;

const contents = await readdir("path/to/directory");
console.log(contents);
```

The example shows one way to pause our program while an asynchronous task is running. Unlike the promise chaining demonstration above, our program will **not** continue until the `readdir` invocation is done.

## Finding the last file in a directory

Now that we know more about asynchronous tasks and how to work with them, let's take another look at the objective. Your `findLastFileInDir` function is given a single argument called `dirPath`. We can use that variable in combination with the `readdir` method and `await` keyword to get everything in a directory, as shown below.

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
}
```

At this point, the `allFiles` variable will be an array with all of the files in the directory at the path specified by `dirPath`. Now our goal is to single out the **last** file in `allFiles`. Here's one way we can accomplish this:

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
  const lastFile = allFiles[allFiles.length - 1];
}
```

We see here that we're accessing `allFiles` (which is an array) and targeting the element at `allFiles.length - 1` (which is equal to the number of files there are minus 1, since arrays start counting at 0). Now all we need to do is return `lastFile`!

```js
const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  const allFiles = await readdir(dirPath);
  const lastFile = allFiles[allFiles.length - 1];

  return lastFile;
}
```

There you have it! Your function should now get all of the files in the directory, capture the last one, and return it.

## Helpful Links

- [MDN Javascript Event Loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)
- [MDN Asynchronous Javascript](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing)
- [MDN Javascript Promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing)
- [MDN Promise Chaining](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises#chaining_promises)
- [MDN Pyramid of Doom](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#:~:text=the%20classic%20callback-,pyramid%20of%20doom,-%3A)
