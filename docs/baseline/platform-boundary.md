# platform 境界チェック ベースライン

Phase 1 task 1-7。`src/js/app/platform/` 以外のレンダラーコードが `electron` / `electron-is-dev` / `fs` / `fs-jetpack` を直接読み込んでいないかを検証した結果の記録。このチケットでは違反を修正していない（アプリケーションの動作は変更なし）。

## 結果

**未達: 違反 17 行 / 15 ファイル。`npm run check:platform` は終了コード 1 で失敗する。**
（CodeRabbit のプランは 30 行と見積もっていたが、platform モジュール導入（#5-#10）後の main で実測した値は 17 行。）

## 実行コマンド

```
npm run check:platform        # node tasks/check_platform_boundary.js
```

内部では次の `git grep -E` を `child_process.spawnSync` で実行する（Bash / zsh にそのまま貼れるよう、シェル側は `$'...'` で引用符を書いている。スクリプト内の正規表現そのものは同じ）。

```
git grep -n -E -e $'[\'"`](electron|electron-is-dev|fs-jetpack|(node:)?fs)(/[^\'"`]*)?[\'"`]' -- src/js ':(exclude)src/js/app/platform'
```

- import 文ではなく引用符付きのモジュール指定子を検索するため、複数行 import、`require(...)`、リテラルの動的 `import(...)`、`node:fs`、`fs/promises` などのサブパスも検出する。`electron-store` には一致しない。
- git grep の終了コード 0 は違反あり（全件を `パス:行:内容` で出力して exit 1）、1 は違反なし（exit 0）、2 以上と spawn エラーは例外で失敗する。許可リストやスキップはない。
- `git grep` は追跡済みファイルのみを検索する。未追跡の新規ファイルは `git add` するまで検出されない。
- `check:platform` は `test` / `ci` / `start` には組み込んでいない（現状では失敗するため）。

## 検証範囲と除外

対象: `src/js` から `src/js/app/platform/` を除いた部分。

| 除外パス | 理由 |
|---|---|
| `src/js/app/platform/` | 境界の内側。ここで Electron / Node を直接扱う |
| `main.js` | メインプロセスのエントリ。契約の対象はレンダラーコード |
| `tasks/` | Node で動くビルド・開発用スクリプト。アプリ実行時のコードではない |
| `src/test/` | テスト基盤。Node API を直接使ってよい |
| `public/code_runner/` | IPC で動く別ウィンドウ。exec 契約の対象外 |
| `public/levels/` | 動的に読み込まれる拡張コンテンツ（validator 等） |

## 違反一覧（実測）

内訳: electron 3 行 / electron-is-dev 7 行 / fs 2 行 / fs-jetpack 5 行 = 17 行。

### electron（3 行）
- `src/js/app/common/code_runner.js:7` `const { ipcRenderer, remote } = require('electron');`
- `src/js/app/components/menu/settings/Settings.jsx:2` `import { remote } from 'electron';`（ファイル内に他の `remote` 使用なし。未使用 import）
- `src/js/index.js:8` `const { shell, remote } = require('electron');`

### electron-is-dev（7 行）
- `src/js/app/common/analytics.js:1`（使用: 37 行目 UA_ID の dev/prod 切替）
- `src/js/app/common/assetLoader.js:2`（使用: 232 行目 拡張モジュールの再読み込み判定）
- `src/js/app/common/firebase.js:1`（使用: 40 行目 DEV/PROD 設定の切替）
- `src/js/app/common/gameEvents.js:1`（使用: 18 行目 appType）
- `src/js/app/components/context_provider/itemsHelper.js:3`（使用: 17 行目）
- `src/js/app/config/config.js:2`（使用: 33 行目）
- `src/js/index.js:5`（使用: 78 行目、144 行目）

### fs（2 行）
- `src/js/app/components/context_provider/system.js:1` `import { readFileSync } from 'fs';`（25 行目で `/proc/cpuinfo` を読む）
- `src/js/app/components/hack_interface/validator/ValidationHelper.js:5` `import { existsSync, promises as fs } from 'fs';`（236 行目 `existsSync`、309 行目 `fs.readFile`）

### fs-jetpack（5 行）
- `src/js/app/common/code_runner.js:2`（64 行目 `jetpack.writeAsync`）
- `src/js/app/common/levelLoader.js:2`（未使用 import）
- `src/js/app/components/ClearDataButton.jsx:2`（42 行目 `jetpack.remove`）
- `src/js/app/components/hack_interface/HackInterface.jsx:2`（未使用 import）
- `src/js/app/components/hack_interface/objective_description/ObjectiveDescription.jsx:3`（未使用 import）

## 現行の platform 契約で表現できないもの

`src/js/app/platform/index.js` の `Platform` 型は paths / dialog / store / fs / shell / exec / devtools のみ。上記の違反のうち次は、契約を拡張しないと移行できない。

- 開発モード判定（`electron-is-dev`）: 7 行すべて。`isDev` を返す API が契約にない。
- code runner の `BrowserWindow` / IPC（`code_runner.js:7-8, 20, 28, 35, 50`）: `BrowserWindow.getAllWindows`、`new BrowserWindow`、`remote.getCurrentWindow`、`ipcRenderer.on('code_runner:log')`。`exec` 契約は子プロセス実行用で、ウィンドウ生成と IPC は対象外。
- メニュー構築（`index.js:93-166`）: `remote.Menu` / `MenuItem` によるアプリケーションメニューの取得と項目追加。契約にメニュー API がない。
- `shell.openItem`（`index.js:130, 139`）: `platform/shell.js` に `openItem` は未実装（`shell.js` のコメントに記載）。`index.js:8` の `shell` 直接取得が残る理由。
- fs の同期 API（`system.js:25` の `readFileSync`、`ValidationHelper.js:236` の `existsSync`）と `fs.promises.readFile`（`ValidationHelper.js:309`）: 契約済みの `platform/fs` が同等の API を持つかは移行時に確認が必要。

プランは `getVersion` も直接参照として挙げていたが、実測では `src/js` に `getVersion` の呼び出しはない。アプリバージョンは `analytics.js:3` で `platform/paths` の `getAppVersion` を使用済みで、違反ではない。

未使用 import（`levelLoader.js:2`、`HackInterface.jsx:2`、`ObjectiveDescription.jsx:3`、`Settings.jsx:2`）は契約の拡張なしで import の削除だけで解消できる。

## 検出の限界

- 計算された `require`: `src/js/app/common/assetLoader.js:239` の `require(absoluteModulePath)`（`requireFromExtension`、221-240 行）。指定子が実行時に決まるため grep では検出できない。拡張モジュールを読み込む意図的な動的ロードで、プラン記載の 222-240 行は関数本体（宣言は 221 行目）。
- `window.require` のエイリアス: `src/js/app/components/hack_interface/validator/Validator.jsx:37` の `const _require = window.require;`（コメントは 35-36 行目）。文字列指定子を伴わないため検出できない。
- ユーザーコードの実行: プレイヤーが書いたコードや拡張の validator が `require('fs')` 等を実行しても、ソースに現れないため検出できない。
- 指定子を変数や連結で組み立てるコード、`git grep` が見ない未追跡ファイルも検出対象外。

## フォローアップ（このチケットでは未実施）

1. platform 契約の拡張: 開発モード判定、code runner（ウィンドウ + IPC）、メニュー構築、`shell.openItem` 相当。
2. 各呼び出し側の移行（electron-is-dev 7 行、electron 3 行、fs 2 行、fs-jetpack 2 行（`code_runner.js:2`、`ClearDataButton.jsx:2`））。
3. 未使用 import 4 行の削除。
4. 違反が 0 件になった後、`check:platform` を `test` または CI に組み込むかを別チケットで判断する。許可リストで回避しない。
5. lint スクリプトはリポジトリに存在せず、このチケットでも ESLint は追加していない。
6. `npm start` による起動確認はユーザーが行う（このチケットはアプリケーションコードを変更していない）。
