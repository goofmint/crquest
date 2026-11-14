# Fetch Request

<div class="aside">
<h3>Requirements</h3>
<ul>
  <li>Create an "async" function called "getMagicalPhrase".</li>
  <li>Use "fetch" to request the magical phrase from the "magic" endpoint.</li>
  <li>Parse the text.</li>
  <li>Copy and paste the magical phrase into the input.</li>
  <li>Once you're done, press <em>HACK</em>.</li>
</ul>
</div>

<i>
The House Gauntlet welcomes you to the third challenge of Lovelace Tower! In this challenge, you must test the powers of `await` by `fetch`ing a magical phrase. You may find this process helpful, Gauntleter, when generating the Divination Spell that will be granted to you in Lovelace Tower upon completion of its challenges.
</i>

Before we get started, let's take a look at an example of fetching data from an API:

```js
const response = await fetch("some_url");
const text = await response.text();
console.log(text);
```

The example above uses `fetch` to request data from "some_url" and uses `await` to "pause" the code until it's finished fetching. It then parses the "text" from the response and prints it to the console.

Create a function called "getMagicalPhrase" that uses `fetch` and `await` to request a magical phrase from the "magic" endpoint, then copy and paste it into the input. You may have to `console.log` in order to see it!

Once you're all done, click the _HACK_ button!
