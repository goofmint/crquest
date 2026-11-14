# Local Function

<div class="aside">
<h3>Requirements</h3>
<ul>
  <li>Create a function called `swapStrings`.</li>
  <li>This function receives 3 string arguments.</li>
  <li>Replace all instances of the "target" string in the "source" string with the "replacement" string, using the `replaceAll` function.</li>
  <li>Return the resulting string.</li>
  <li>Once you're done, press <em>HACK</em>.</li>
</ul>
</div>

<i>
Welcome, Gauntleter, to the first of many challenges in the Arcane Academy's annual House Gauntlet. As you progress through Lovelace Tower, you will be tested on your ability to apply your knowledge of APIs. For this first challenge, the House Gauntlet asks you to explore how local APIs, provided by libraries as functions and objects, can manipulate the written word, as befits House Lovelace. For this, you'll use the `String.replaceAll` method to replace all instances of a particular string with something else.
</i>

For example:

```js
const myString =
  "I read in a book that the answer to the universe is: one two one two one two.";
const swappedString = myString.replaceAll("two", "zero");

console.log(swappedString);
```

would print `I read in a book that the answer to the universe is: one zero one zero one zero.` to the console.

Local function APIs have the power to alter not just individual sentences, but entire tomes. A Gauntleter might imagine the chaos if one were to swap every `" "` in a House Lovelace volume for a `""`. How easily important documents could be corrupted - or repaired - through such simple APIs!

Create a function called `swapStrings` that takes 3 string arguments:

- `sourceString`
- `targetWord`
- `replacementWord`

Replace all instances of `targetWord` in the `sourceString` with `replacementWord` and return the result.

Once finished, click the _HACK_ button!
