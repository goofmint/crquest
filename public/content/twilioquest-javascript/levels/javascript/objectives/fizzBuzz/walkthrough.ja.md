# 面接でよく出る問題

この問題は[面接でよく出る「Fizz Buzz」](https://learnjswith.me/javascript-fizzbuzz/)の応用です。条件分岐の理解を深め、新しい演算子を学びましょう。

## 割り切れるかを調べるには剰余演算子を使う

このスクリプトでは、ある数が別の数で割り切れるかを判定します。JavaScript には多くの言語と同様に、`Remainder Operator`（剰余演算子）があります。`%` と書き、2 つの数を割った余りを返します。

たとえば次のようになります。

```js
12 % 5 === 2;
4 % 2 === 0;
12 % 3 === 0;
```

割り切れる場合、`%` の結果は `0` です。

## ひな型コード

次の場所に JavaScript ファイルを作成してください。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>/fizzBuzz.js`

以下をひな型として使えます。

```js
const numberInput = Number(process.argv[2]);
let output = '';

if (false) {
  output += 'Java';
}

if (false) {
  output += 'Script';
}

if (false) {
  output = String(numberInput);
}

console.log(output);
```

いろいろな入力でコードを試してください。

```bash
node fizzBuzz.js 15
```

正しく動くようになったら、*ハック*をクリックしてください。
