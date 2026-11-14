# Async Await

<div class="aside">
<h3>Requirements</h3>
<ul>
  <li>Create an `async` function called `findLastFileInDir`.</li>
  <li>This function receives a string that points to a directory.</li>
  <li>Read all the items in the directory provided using `await` and `readdir`.</li>
  <li>Return the last item in the directory.</li>
  <li>Once you're done, press <em>HACK</em>.</li>
</ul>
</div>

<i>
Welcome, Gauntleter, to the second challenge of Lovelace Tower. For this challenge, you must acknowledge the magical powers of `asynchronous` functions. Because of this asynchronicity, wielders of such API powers must `await` the return of their functions. But delaying the instant execution of code has a worthwhile power: it can transcend the very concept of linear time.
</i>

Two important tools to understand when working with Web APIs are `async` (short for asynchronous) and `await`. We'll be using these tools to perform actions that can take a while to finish. Let's use the `readdir` (short for read directory) method to asynchronously pull in all of the items in a directory and return the last entry.

For example, if you had a directory that looked like the following tree:

```plaintext
adventures/
├── places/
│ ├── javascript-test-labs.txt
│ ├── pythonic-temple.txt
│ ├── forest-of-open-source.txt
│ ├── tower-of-inifinite-knowledge.txt
│ ├── api-academy.txt
```

you'd want to return the `api-academy.txt` file.

Create a function called `findLastFileInDir` that uses `await` and `readdir` to get all the items in the `dirPath` directory and return the last one.

Once you're finished, click the _HACK_ button!
