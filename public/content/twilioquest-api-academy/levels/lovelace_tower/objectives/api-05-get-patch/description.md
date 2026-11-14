# Get and Post

<div class="aside">
<h3>Requirements</h3>
<ul>
  <li>Create an async function called "getAndPatchCorruptedInscription".</li>
  <li>This function receives a number.</li>
  <li>Fetch and parse the corrupted inscription from the "divination" endpoint.</li>
  <li>Get the inscription fragments from the scrolls that litter the library.</li>
  <li>Send the patched inscription as well as the guid to the "divination" endpoint.</li>
  <li>Once you're done, press <em>HACK</em>.</li>
</ul>
</div>

<i>
Welcome to the final challenge of Lovelace Tower.<br><br> 
Here the House Gauntlet grants you the privilege of reading House Lovelace's divination incantation inscribed into this statue's facade. This inscription is the core of the Divination Spell you have earned in Lovelace Tower, its very words essential to the spell's ability to work... 
</i>

It looks like something has happened inside the secret Lovelace library: books have been torn from their shelves and scattered around the room; and the Divination Incantation has been corrupted! Let's put everything we've learned together and repair the House Lovelace inscription so that the Divination Spell will work once again!<br><br>
We'll need to first `fetch` the corrupted inscription to see which parts need fixing. After that, we'll have to gather fragments from scrolls scattered throughout the library, combine their text as part of a string in the QuestIDE. Finally, we'll need to send the repaired inscription to the "divination" endpoint via a `patch` request.

Here's an example of sending a `patch` request:

```js
const response = await fetch("{{DIVINATION_ENDPOINT}}", {
  method: "PATCH",
  body: JSON.stringify({
    guid: "{{GUID_ARGUMENT}}",
    data: {
      inscription: "{{REPAIRED_INSCRIPTION}}",
    },
  }),
});

// This code isn't required, but can be helpful in tracking errors
const jsonData = await response.json();
console.log(jsonData);
```

Create a function called `getAndPatchCorruptedInscription`, fetch the corrupted inscription from the "divination" endpoint, find the parts of the inscription that are missing by searching through the fragments in the library and put them together in your QuestIDE, then send the repaired inscription back to the "divination" endpoint via a "patch" request along with the "guid". Using `console.log` to print the responses you get may prove useful here!

Once you're all done, click the _HACK_ button!
