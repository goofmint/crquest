# Fetch Request

<div class="aside">
<h3>Requirements</h3>
<ul>
  <li>Create an "async" function called "getFilteredAuthors".</li>
  <li>The function receives a number.</li>
  <li>Use "fetch" to get books from the endpoint and parse it.</li>
  <li>Filter the books by extra pages written relative to "pageCount".</li>
  <li>Map the books to their author names.</li>
  <li>Return the result.</li>
  <li>Once you're done, press <em>HACK</em>.</li>
</ul>
</div>

<i>
Welcome, Gauntleter, to the fourth challenge of Lovelace Tower. For this challenge, you must excercise your newly acquired `async` and `await` abilities to uncover the names of authors of a group of special books housed in a remote library in The Cloud. These author names are said to have ties to a powerful incantation, which, when invoked, will earn you the `Divination Spell` that you will need to progress through the remaining houses of the Gauntlet. To identify these names, however, the House Gauntlet grants you only a single clue: each of these authors has written more than a certain number of pages. Once you uncover the specific names, read them aloud to produce the Divination Spell.
</i>

The previous objective asked you to immediately return data from an API (Application Programming Interface). We'll want to do a bit more than that, normally, so this time let's do work with the response we get from the new endpoint. Similar to before, we'll be using `fetch` combined with `await` to request data.

Here's an example of fetching data and parsing the JSON (Javascript Object Notation) response from an API:

```js
const response = await fetch("some_url");
const jsonData = await response.json();
console.log(jsonData);
```

The example above requests data from "some_url", uses `await` to "pause" the code until a response comes back, parses the JSON with `response.json`, and prints it to the console.

Create a function named "getFilteredAuthors" that requests and parses data from the endpoint, filters the authors by those who have written **more** pages than the `pageCount` input, and returns the names of those authors in the form of an array.

Once finished, click the _HACK_ button!
