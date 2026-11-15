# Vitest への移行 (Phase 9: 9-1 〜 9-4)

Jest 26 + `@jest-runner/electron` (テストを Electron のレンダラー内で実行) + babel-jest を、Vitest + @testing-library/react に置き換えた。テストは通常の Node.js で動き、Electron を起動しない。設定は `vitest.config.mjs` (アプリのビルド用 `vite.config.mjs` は使わない)。

## 環境

- 環境は jsdom。理由: (1) Phaser 2 / firebase を `window.eval` で読み込む `src/test/setup.js`、`document.baseURI` を使う `fs_utils`、`getComputedStyle` など、実在の DOM と `window` が必要。(2) happy-dom は `<base>` / `getComputedStyle` / CSS の扱いが jsdom より緩く、Electron (Chromium) 上で書かれたテストの意図を保ちにくい。
- 元の環境にあったもので jsdom / Node に無いものは次のように補った。
  - IndexedDB (Dexie): `fake-indexeddb/auto` を `libraryUpgrades.test.js` で読み込む。
  - Web Worker (`codeRunnerWorker.integration.test.js`): `src/test/utils/nodeWorker.js` が `worker_threads` 上に `new Worker(url)` 互換 (`postMessage` / `terminate` / `message` `messageerror` `error`) を作り、実際の `public/code_runner/worker.js` を file: URL から読み込む。structured clone、同期無限ループの `terminate()`、読み込み失敗は実物と同じ挙動。ブラウザエンジン固有の挙動 (Chromium のエラー文言など) は確認できない。
  - `electron` (`remote.app`) と `electron-is-dev`: Electron 外では import 時に失敗するため、`src/test/setup.js` が代用品を `vi.mock` する。個別のテストは自前の `vi.mock` / `vi.doMock` で上書きする。
  - ページが `file:` で読み込まれていること: jsdom の URL は http のため、`fs_utils.test.js` は `<base href>` で `document.baseURI` を設定する。
  - レイアウト: jsdom は要素を配置しない (`getBoundingClientRect` が 0)。`SplitterLayout.test.js` のドラッグのテストだけ、`getBoundingClientRect` に 400x500 / 4px のスプリッターの値を与える。

## モジュール解決

- レンダラーの依存 (react 19, styled-components, yup, dexie など) は `public/node_modules` にある。`vitest.config.mjs` のプラグインが、ルートから解決できない裸の import を `public/node_modules` から解決する (Jest の `modulePaths` 相当)。
- React のインスタンスは 1 つに固定する。`react` / `react-dom` を `public/node_modules` に alias し、`@testing-library/react` は CommonJS 版が独自に `require('react-dom')` してルートの `node_modules` を見てしまうため、ESM ビルドを alias して Vite 側で処理する。
- ルートの `node_modules` には npm パッケージの `url` / `events` があるが、アプリとテストの `import 'url'` は Node 組み込みを指す (Electron の `require` と同じ)。プラグインが組み込みを先に解決する。

## Jest からの変換で変わった点

- `vi.mock` は import より前に巻き上げられる。ファクトリーが返すオブジェクトは ES モジュールの名前空間として扱われるため、旧テストが「モジュール全体が default になる」(Babel の interop) ことに頼っていた箇所は `default` を明示した。コンポーネントを返すファクトリーも `{ default: ... }` にした。
- `jest.isolateModules` + `require` は `vi.resetModules()` + `vi.doMock` + 動的 `import()` (非同期) に置き換えた。
- 補助ファイル (`src/test/utils/mock*Factory.js`) 内の `jest.mock` は、Jest ではテスト全体に効いたが Vitest ではそのファイルのテストにしか効かないため削除した (これらを使うテストは自前で同じモジュールを `vi.mock` している)。
- `vi.resetAllMocks()` は `vi.fn(impl)` を実装なしにせず、元の `impl` に戻す (Vitest 3 以降)。Jest 26 は実装を消した。該当テスト (`exec`, `ValidationHelper`) は結果が変わらないことを確認した。
- `fs.rmdirSync(dir, { recursive: true })` は Node 26 で使えないため `fs.rmSync(dir, { recursive: true, force: true })` にした。
- `await` されていなかった `expect(...).rejects` (`assetLoader.test.js`) を `await` した。Vitest は await 漏れをエラーにする。

## 削除したもの

`jest`, `@jest-runner/electron`, `babel-jest`, ルートの `@babel/*` と `.babelrc`, `jest.config.js`。`@jest-runner/electron` 用の patch-package パッチが無くなったため `patches/`、`patch-package`、`postinstall` の `patch-package --error-on-fail` も削除した。
