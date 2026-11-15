# 未使用依存の削除 (Phase 8: #52)

各候補について、`src`、`tasks`、`main.js`、`vite.config.mjs`、`jest.config.js`、`.babelrc`、`public/content` (`node_modules` を除く)、`public/code_runner` を `require` / `import` で grep し、参照が無いことを確認してから削除した。アプリは起動して確認していない (ビルドと Jest のみ)。

## 削除したもの

`public/package.json` (レンダラーの実行時依存)
- `vm2`、`express`、`body-parser`、`got`、`command-exists`、`twilio`、`@sendgrid/client`、`@sendgrid/mail`

`package.json` (ルート)
- `react-dev-utils`、`babel-plugin-file-loader`、`babel-plugin-module-resolver` (Babel ビルドの廃止後、どこからも参照されない)、`i` (devDependency)

`public/content/*/package.json` は同梱コンテンツの原文なので変更していない。`twilioquest-api-academy` (`twilio`)、`twilioquest-javascript` と `twilioquest-open-source` (`command-exists`、`got`) の宣言は残るが、コンテンツのコードはこれらを `require` していない (`vendoredJavaScript.test.js` などが禁止している)。拡張のローダー (`moduleAllowlist.js`) も `twilio` を拒否する。

## 残したもの (チケットの候補のうち、使われている)

| パッケージ | 使用箇所 |
| --- | --- |
| `jimp` | `src/js/app/common/avatarRenderer.js` (`CustomAvatarCreator.jsx` が使う) |
| `pug` | `src/js/app/components/Conversation.jsx`、`tasks/generate_voice_overs/*` (ルートの `pug` も同じ) |
| `cheerio` | `src/js/app/components/Conversation.jsx`、`tasks/generate_voice_overs/read_conversation_files.js` (ルートの `cheerio` も同じ) |
| `ejs` | `src/js/app/components/hack_interface/objective_description/ObjectiveDescription.jsx` |

ルートの `prettier` は `.prettierrc` 用のエディタ・CLI ツールなので、参照が無くても残した。`@babel/runtime` は `.babelrc` の `plugin-transform-runtime` (Jest) が使うため残した。

## ロックファイル

- `public/package-lock.json`: ルートの devDependency の npm 6 で再生成 (lockfileVersion 1 のまま)。
- ルートの `package-lock.json`: Node 26 の npm 11 で `npm install --package-lock-only --ignore-scripts` を実行して再生成 (v3)。`rm -rf node_modules public/node_modules && npm ci` の後、`npm run build:all` とテストが通ることを確認した。
