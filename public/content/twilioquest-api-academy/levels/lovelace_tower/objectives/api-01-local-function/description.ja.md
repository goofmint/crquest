# ローカル関数

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>`swapStrings` という名前の関数を作成します。</li>
  <li>この関数は文字列を 3 つ受け取ります。</li>
  <li>`replaceAll` 関数を使い、「source」文字列に含まれる「target」文字列をすべて「replacement」文字列に置き換えます。</li>
  <li>置き換え後の文字列を返します。</li>
  <li>できたら <em>HACK</em> を押します。</li>
</ul>
</div>

<i>
競技者の皆さん、秘術 API 学院の毎年恒例の寮の試練へようこそ。ラブレス塔を進みながら、API の知識を実践で活かす力が試されます。最初の課題では、ラブレス寮らしく、ライブラリの関数やオブジェクトとして提供されるローカル API で文章を加工します。`String.replaceAll` メソッドを使い、指定した文字列のすべての出現箇所を別の文字列に置き換えましょう。
</i>

例えば、次のコードを実行します。

```js
const myString =
  "I read in a book that the answer to the universe is: one two one two one two.";
const swappedString = myString.replaceAll("two", "zero");

console.log(swappedString);
```

コンソールには `I read in a book that the answer to the universe is: one zero one zero one zero.` が表示されます。

ローカル API の関数なら、一文だけでなく本一冊を書き換えることもできます。ラブレス寮の本にある `" "` をすべて `""` に置き換えたら、どれだけ混乱するでしょう。こんな簡単な API でも、大事な文書を壊したり、修復したりできるのです！

文字列の引数を 3 つ受け取る `swapStrings` 関数を作成します。関数名と引数名は、次の英語の名前をそのまま使います。

- `sourceString`
- `targetWord`
- `replacementWord`

`sourceString` 内にある `targetWord` の出現箇所をすべて `replacementWord` に置き換え、結果を返します。

できたら _HACK_ を押してください！
