# build:all と npm test のベースライン

注意: 本書の数値はすべて「診断(--legacy-peer-deps)」での結果であり、plain baseline(素の `npm install`)の結果ではない。

## 前提

- 素の `npm install` は Node 18.20.8 / npm 10.8.2 で ERESOLVE により失敗する(#2で記録済み)。原因は `@electron/remote@2.0.9` の peer `electron>=13` と root の `electron@^11.5.0` の不一致。
- したがって ticket の `npm run build:all` / `npm test` は plain baseline 上では実行できない。
- 以下は、隔離クローン(main, eef15c8)での診断結果である。

## 試行A(診断)の環境・コマンド・結果

環境: macOS(Darwin 27.2.0, arm64), Node 18.20.8, npm 10.8.2, Python 3.9.21(pyenv)。

```sh
SCR=/path/to/scratch   # 作業ディレクトリ(node18 と build-baseline を置いた場所)
export PATH=$SCR/node18/node-v18.20.8-darwin-arm64/bin:$PATH
export PYENV_VERSION=3.9.21
cd $SCR/build-baseline
npm install --legacy-peer-deps --loglevel verbose --foreground-scripts > $SCR/build-A-install.log 2>&1
```

結果:

- 終了コード 0、所要約71秒。ERESOLVE は発生せず。
- node-sass 8.0.0: npm キャッシュの `darwin-arm64-108_binding.node` が使われたが、dlopen で "slice is not valid mach-o file" となり「Binary has a problem」と判定された。その後 postinstall が node-gyp rebuild(arm64, c++ コンパイル)を実行して成功し、`vendor/darwin-arm64-108/binding.node` を生成した。つまり最終的には node-gyp による再ビルドである。
- Electron 11.5.0: postinstall で取得され、`Electron.app/Contents/MacOS/Electron` は Mach-O arm64(x64 へのフォールバックなし)。
- `postinstall` → `install:app`(`cd ./public && npm install`)は実行され、`public/node_modules` が作成された。
- `git status` は clean(生成物は ignore 対象)。
- 末尾に npm audit の脆弱性警告が出るが、本チケットの範囲外。

## 試行B(診断)

試行Aのインストールが成功したため、実施しなかった。

## ビルド結果(`npm run build:all`)

```sh
npm run build:all > $SCR/build-A-build.log 2>&1
```

- 終了コード 0。
- build:js(babel): 成功。"Successfully compiled 134 files with Babel."。`public/index.js` と `public/app/` を生成。
- build:css(node-sass): 成功。`public/index.css` を生成。
- build:html(pug): 成功。`public/index.html` を生成。
- 警告: browserslist の caniuse-lite が古い、という通知のみ。

## テスト結果(`npm test`)

```sh
npm test -- --verbose --json --outputFile=$SCR/jest-A.json > $SCR/build-A-test.log 2>&1
```

- 終了コード 1、所要約5秒(ハングなし)。runner は `@jest-runner/electron`。ディスプレイ起因の失敗は見られなかった。
- 集計(診断): suites 4件中 passed 1 / failed 3 / pending 0。tests 1件中 passed 1 / failed 0 / pending 0。
- 失敗した3 suite(いずれも "Test suite failed to run" で、テストケースは1件も実行されていない):
  - `src/test/app/common/analytics.test.js`
  - `src/test/app/common/assetLoader.test.js`
  - `src/test/app/common/extensions.test.js`
- 共通のメッセージ: `TypeError: Cannot read property 'app' of undefined`。発生箇所は `import isDev from 'electron-is-dev'`。`electron-is-dev@1.1.0` は `electron.app || electron.remote.app` を評価する。このとき `electron.remote` が undefined である。Electron 11 では remote は組み込みだが、`@electron/remote` 導入後に旧 `remote` 経路が使えない構成が原因と推測される(未検証)。
- 通過した suite: `src/test/app/components/Button.test.js`(1件, "Button component")。
- `src/test/fixtures/extensions/.bundled` は存在せず、テスト後の残骸はなかった。クローン内の復元作業は不要だった。

## lint について

`package.json`(root と public)に `lint` スクリプトは未定義である。本チケットでは lint を導入しない。

## 実行できなかった検証と理由

- plain baseline(素の `npm install`)上の build:all / test: インストールが ERESOLVE で失敗するため不可。
- ゲーム本体の起動確認(`npm start` / `electron .`): ルールにより実施していない。
- `npm run ci`: ルールにより実施していない。
- 試行B(Node 14 + npm 6): 試行Aが成功したため未実施。
- 失敗3 suite の個別テストケースの合否: suite がロード時点で落ちるため不明。

## 診断の設定について

`--legacy-peer-deps` は診断のためにコマンドラインで指定しただけである。`.npmrc` やスクリプト等には記録しておらず、リポジトリには何も残していない。

## 結果から言える次の一手(候補のみ。実装しない)

- インストール問題: `@electron/remote` を electron 11 と peer が整合するバージョンにする、electron を >=13 に上げる、`.npmrc` に `legacy-peer-deps=true` を置く、などの候補がある。いずれも別チケットで判断する。
- テスト失敗: 3 suite の失敗は `electron-is-dev` と `electron.remote` の関係に起因する可能性が高い。`@electron/remote` 対応のモックを `src/test/setup.js` に置く、`electron-is-dev` を差し替えるなどの候補がある。要因の切り分けは別途必要。
- node-sass の arm64 キャッシュバイナリは不正で、node-gyp 再ビルドに依存している。Xcode CLT と Python が必要になる点を環境要件として記録するとよい。

## 追記: 3 suite の失敗の原因と修正(#75)

上記の `analytics` / `assetLoader` / `extensions` の失敗は、アプリ本体の不具合ではなく、テスト基盤側の問題だった。#75 で修正済みで、現在は 4 suite / 39 テストがすべて通過する。

- 原因 1(3 suite がロード時に失敗): `@jest-runner/electron`(3.0.0。最新の 3.0.1 も同じ)は、テスト用 BrowserWindow を `webPreferences: {nodeIntegration: true}` だけで作る。Electron 10 以降は `enableRemoteModule` の既定が false なので `electron.remote` が `undefined` になり、`electron-is-dev@1` の `electron.app || electron.remote.app` が `Cannot read property 'app' of undefined` で落ちる。アプリ本体では `main.js` が `enableRemoteModule: true` を指定している点がテストと異なる(アプリの起動確認は未実施)。
- 原因 2(`assetLoader` の 1 テスト): テストは `require('foo')` が `'bar'` を返す前提だが、`foo` の実体が `.gitignore` の `node_modules` ルールで無視され、upstream にも存在しなかった。
- 修正: `patch-package` でテスト用ランナーの `webPreferences` に `enableRemoteModule: true` を追加し(`patches/`)、`foo` のフィクスチャを追加して追跡対象にした。
- 補足: 原因 1 の間は 3 suite のテストが 1 件も実行されていなかった(通過 1 件だったのは `Button.test.js` のみ)。修正後に 39 件が初めて実行されている。
