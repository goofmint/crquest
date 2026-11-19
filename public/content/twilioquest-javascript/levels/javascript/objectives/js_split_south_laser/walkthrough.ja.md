<%
const worldState = levelState.TQ_JAVASCRIPT_WORLD_STATE;
const isObjectiveReady = worldState.southWing &&
worldState.southWing.hadSavedConversation;
%>

# レーザーを再起動する

<% if (isObjectiveReady) { %>

南棟で学んだ条件分岐を使って、この課題に取り組みましょう。次のコード用フォルダーに `sortOrder.js` を作ります。

`<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>`

以下をひな型として使えます。

```js
const firstValue = process.argv[2];
const secondValue = process.argv[3];

// Your comparison code (if statements) go here
```

1 番目の値がアルファベット順で前か、同じか、後かによって、3 つの数値のうちひとつを出力します。次のように実行した場合、

```bash
node sortOrder.js cats dogs
```

`-1` のはずです。`cats` は `dogs` より先に来るためです。次の例では、

```bash
node sortOrder.js cats CATS
```

`0` のはずです。`cats` と `CATS` は大文字小文字を除けば同じ文字列です。最後の例では、

```bash
node sortOrder.js dogs cats
```

`1` のはずです。`dogs` は `cats` より後に来るからです。

[文字列をアルファベット順で比較する方法](https://javascript.info/comparison#string-comparison)が参考になります。比較前に [toLowerCase](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLowerCase) で両方の文字列を小文字にそろえるとよいでしょう。

南棟の課題と似ています。必要ならそのときのコードを見返してください。目標どおりに動いたら、_ハック_ をクリックしましょう！

## 参考資料

- [MDN：条件分岐のリファレンス](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/conditionals)
- [JavaScript.info：文字列の比較](https://javascript.info/comparison#string-comparison)

<% } else { %>

停止ビームの操作盤はロックされています。レーザーを起動するには**植物学者のアクセスコード**が必要です。

植物学者はおそらく、ダックタイピウムが植物に与える影響を調べていたラボの**南棟**にいます。

**植物学者に話しかけ**、このビームのアクセスコードを受け取ってください。

<% } %>
