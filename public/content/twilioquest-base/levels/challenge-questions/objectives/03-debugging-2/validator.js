module.exports = async function (helper) {
  try {
    // The learner's code and the test cases run in a Web Worker (functions
    // cannot leave it), so the checks run there and a failed check is thrown as
    // an error. See docs/migration/validation-helper-worker.md.
    await helper.evaluateInQuestIdeUserCodeLocalScope(
      () => {
        const fail = (message) => {
          throw new Error(message);
        };

        // lodash.isequal (used before the check ran in a Worker, where there is
        // no require) for the values a learner function can return: same value
        // (SameValueZero), boxed primitives, arrays, and objects compared by
        // their own enumerable keys, symbols included, and constructors.
        const isEqual = (value, other) => {
          const isObjectLike = (v) => v !== null && typeof v === "object";
          const tagOf = (v) => {
            const tag = Object.prototype.toString.call(v);
            return tag === "[object Arguments]" ? "[object Object]" : tag;
          };
          const ownKeys = (object) =>
            Object.keys(object).concat(
              Object.getOwnPropertySymbols(object).filter((symbol) =>
                Object.prototype.propertyIsEnumerable.call(object, symbol)
              )
            );

          if (value === other) {
            return true;
          }
          if (
            value == null ||
            other == null ||
            (!isObjectLike(value) && !isObjectLike(other))
          ) {
            return value !== value && other !== other;
          }

          const tag = tagOf(value);
          if (tag !== tagOf(other)) {
            return false;
          }

          switch (tag) {
            case "[object Boolean]":
            case "[object Date]":
            case "[object Number]": {
              const a = +value;
              const b = +other;
              return a === b || (a !== a && b !== b);
            }
            case "[object String]":
            case "[object RegExp]":
              return value == other + "";
            case "[object Array]": {
              if (value.length !== other.length) {
                return false;
              }
              // An index loop, not every(): a hole of a sparse array is read
              // as undefined (every() skips holes)
              for (let index = 0; index < value.length; index++) {
                if (!isEqual(value[index], other[index])) {
                  return false;
                }
              }
              return true;
            }
            case "[object Object]": {
              const valueKeys = ownKeys(value);
              const otherKeys = ownKeys(other);
              if (valueKeys.length !== otherKeys.length) {
                return false;
              }
              const sameEntries = valueKeys.every(
                (key) =>
                  Object.prototype.hasOwnProperty.call(other, key) &&
                  isEqual(value[key], other[key])
              );
              if (!sameEntries) {
                return false;
              }
              const valueCtor = value.constructor;
              const otherCtor = other.constructor;
              return !(
                valueCtor != otherCtor &&
                "constructor" in value &&
                "constructor" in other &&
                !(
                  typeof valueCtor == "function" &&
                  valueCtor instanceof valueCtor &&
                  typeof otherCtor == "function" &&
                  otherCtor instanceof otherCtor
                )
              );
            }
            default:
              // Map, Set, typed arrays, ...: never equal to the plain data
              // these tests expect
              return false;
          }
        };

        const assertTestCase = (testFunction) => (input, expected) => {
          const testResult = testFunction(input);
          const errorMessage = `<div style="text-align:left;overflow: scroll;">
    <span class="highlight">Expected</span>
    <pre>${JSON.stringify(expected, undefined, 2)}</pre>
    </pre><span class="highlight">But received</span><pre>${JSON.stringify(
      testResult,
      undefined,
      2
    )}</pre>
    </div>`;

          if (!isEqual(testResult, expected)) {
            fail(errorMessage);
          }
        };

        let learnerFunction;
        try {
          learnerFunction = sumRadLevels;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function sumRadLevels is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test(
          [
            {
              id: 623,
              label: "Reservoir-2A-East-Wing",
              radiation: {
                radsCountCurrent: "190",
                monitorSystemGuid: "8453b2e7-0cf3-43fa-8909-cab00f75d413",
              },
              type: "raw",
              contents: 83,
            },
            {
              id: 21,
              label: "Reservoir-2B-East-Wing",
              radiation: {
                radsCountCurrent: "48",
                monitorSystemGuid: "55eee6a5-5fb9-4118-b015-7f656b845465",
              },
              type: "distilled",
              contents: 120,
            },
            {
              id: 617,
              label: "Reservoir-3F-North-Wing",
              radiation: {
                radsCountCurrent: "39",
                monitorSystemGuid: "bf0b28be-ae90-406a-8f90-c556b0056f2e",
              },
              type: "raw",
              contents: 100,
            },
            {
              id: 100,
              label: "Reservoir-3G-North-Wing",
              radiation: {
                radsCountCurrent: "712",
                monitorSystemGuid: "e1e73107-f0ad-495d-a11c-e730543f1ad5",
              },
              type: "raw",
              contents: 98,
            },
          ],
          989
        );

        return { outcome: "ok" };
      },
      {},
      "03-debugging-2"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
