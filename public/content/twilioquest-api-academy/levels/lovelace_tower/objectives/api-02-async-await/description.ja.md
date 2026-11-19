# async と await

<div class="aside">
<h3>達成条件</h3>
<ul>
  <li>`async` 関数 `findLastFileInDir` を作成します。</li>
  <li>関数はディレクトリを指す文字列を受け取ります。</li>
  <li>`await` と `readdir` を使い、指定されたディレクトリ内の項目をすべて読み込みます。</li>
  <li>ディレクトリ内の最後の項目を返します。</li>
  <li>できたら <em>HACK</em> を押します。</li>
</ul>
</div>

<i>
競技者の皆さん、ラブレス塔の二つ目の課題へようこそ。今回は `asynchronous`（非同期）関数の魔法を学びます。API の力を操るには、関数が結果を返すまで `await` で待つ必要があります。コードの実行を少し待たせることで、時間の順序を自在に扱えるのです。
</i>

Web API を扱ううえで重要なのが、asynchronous（非同期）を略した `async` と `await` です。これらを使って、完了までに時間のかかる処理を扱います。今回は、ディレクトリを読み取る `readdir`（read directory）メソッドを使い、ディレクトリ内の項目を非同期に読み込んで最後の項目を返します。

例えば、次のようなディレクトリがあるとします。

```plaintext
adventures/
├── places/
│ ├── javascript-test-labs.txt
│ ├── pythonic-temple.txt
│ ├── forest-of-open-source.txt
│ ├── tower-of-inifinite-knowledge.txt
│ ├── api-academy.txt
```

この場合は `api-academy.txt` を返してください。

`findLastFileInDir` という名前の関数を作成してください。`await` と `readdir` を使って `dirPath` ディレクトリの項目をすべて取得し、最後の項目を返してください。関数名と引数名は英語のまま使います。

できたら _HACK_ を押してください！
