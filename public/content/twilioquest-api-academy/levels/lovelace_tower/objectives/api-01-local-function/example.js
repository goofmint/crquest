function swapStrings(sourceString, targetWord, replacementWord) {
  // TODO: swap the strings!
}

console.log("Test case 1:");
console.log(
  swapStrings(
    'As a famous API master once said, "ATCHOOO"!',
    "ATCHOOO",
    "HATEOAS"
  )
);

console.log("Test case 2:");
console.log(
  swapStrings(
    "The b*ooks **can b*ecome qui*t*e *dusty* i*f we *do*n't clea**n th*em *oft*en!",
    "\\*",
    ""
  )
);

console.log("Test case 3:");
console.log(
  swapStrings(
    "If~~~not~~~for~~~books~~~and~~~documentation,~~~we~~~would~~~be~~~swimming~~~in~~~a~~~sea~~~of~~~spaghetti!",
    "~~~",
    " "
  )
);

console.log("Test case 4:");
console.log(
  swapStrings("The    library    is    very    spacious!", "   ", "")
);
