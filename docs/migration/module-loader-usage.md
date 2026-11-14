# Phase 3-1: `requireFromExtension` 利用箇所の棚卸しとモジュールローダー設計の根拠

Issue #18 の成果物である。あわせて #19 (ローダー本体)、#20 (許可リスト)、#22 (単体テスト) の実装方針をここに記録する。アプリケーションの実行時の挙動は変更していない。`assetLoader.js` と呼び出し元は未変更で、切り替えは別チケット (#21) で行う。

- 調査対象コミット: `b70c80d` (main)
- 同梱コンテンツの走査対象: `public/node_modules` の `twilioquest-*` 7 件 (api-academy 3.0.2, base 8.1.0, dev-fundamentals 2.4.0, javascript 1.1.7, open-source 2.0.1, python 1.0.7, twilio-vr 1.1.4) と `owls-nest-extension` 1.0.10

## 1. 現行実装

`src/js/app/common/assetLoader.js:221-240` の `requireFromExtension(modulePath)` が唯一の実装である。

1. `modulePath` が空なら `Error('modulePath is required.')` を投げる (221-224 行)。
2. `resolveAbsolutePath(modulePath)` で絶対パスへ解決する。どの拡張機能にも無ければ `null` を返す (エラーではない)。
3. `isDev || window.reloadExternalModules` が真なら `delete require.cache[require.resolve(absoluteModulePath)]` で当該ファイルだけキャッシュを破棄する (232-236 行)。
4. Node の `require(absoluteModulePath)` で読み込み、`module.exports` をそのまま返す (239 行)。

`window.reloadExternalModules` はコードベース内のどこにも代入されていない。`isDev` が偽の環境で、開発者が DevTools から手動で立てるためのフラグである。

### パス解決 (`resolveAbsolutePath`, `assetLoader.js:149-163`)

`getAllValidExtensions()` が返す拡張機能ディレクトリを順に調べ、`path.join(extension.absolutePath, relativePath)` が `fs.stat` で存在した最初のものを返す。すべて無ければ `undefined`。拡張機能ディレクトリは、同梱分 (`public/node_modules/<拡張機能>`、`BUNDLED_EXTENSION_DISTRIBUTION_DIRECTORY = 'node_modules'`) とユーザーの拡張機能フォルダである (`common/extensions.js`)。したがって、同じ相対パスが複数の拡張機能にある場合は優先順位の高い方が採用される。

## 2. 呼び出し 5 箇所

| # | 場所 | 渡すパス | 読み込む対象 | 戻り値の使われ方 |
| --- | --- | --- | --- | --- |
| 1 | `components/nav_map/hooks/useTiledMap.js:30` | `RELATIVE_MAP_PATH` = `images/nav_map/star_map.json` (`nav_map/assets.js:5`) | Tiled のマップ JSON | `mapData.tilesets` を参照 |
| 2 | `components/nav_map/hooks/useTiledMap.js:36` | `path.join(path.dirname(mapPath), source)` (`source` はマップ JSON 内のタイルセット相対パス) | Tiled のタイルセット JSON | `file.image`、`file.tiles` を参照し展開 |
| 3 | `components/hack_interface/validator/Validator.jsx:140` | `path.join(objective.objectivePath, 'validator.js')` (`HackInterface.jsx:70-88` で `levels/<level>/objectives/<name>` を組み立て) | 目標ごとの検証関数 | 関数として呼ぶ (`helper`、または `(context, ...)` を受け取る) |
| 4 | `components/game/Game.jsx:266` | `` `objects/${objectKey}/config.js` `` (`readDirectory('objects')` の各ディレクトリ、`.` 始まりは除外) | オブジェクト定義モジュール | `EntityConfigService.register(objectKey, object)` に渡す。失敗は try/catch で握り、`null` 扱いでスキップ |
| 5 | `common/levelLifecycleManager.js:59` | `levelLoader.getEventsModulePath(level.levelName)` = `levels/<level>/events.js` (`levelLoader.js:18,21,174`) | レベルのイベントハンドラ | `this.eventHandler` に代入し、イベントごとに `(event, world.generateAPI(...))` で呼ぶ。`null` (ファイル無し) は許容。失敗は try/catch で `console.error` |
| - | `common/world.js:6` | (呼び出しなし) | - | `import` のみで、ファイル内で使われていない。切り替え時に import を削除してよい |

補足。

- 呼び出し 1, 2 は `.json` を `require` するので、戻り値は Node が `JSON.parse` したオブジェクトである。
- 呼び出し 3〜5 の戻り値は関数またはオブジェクトで、モジュールの形は次節のとおり。
- 呼び出し 1〜2 は `Promise.all` で並列に呼ばれる。4 も `Promise.all` の並列である。ローダーは並列呼び出しに耐える必要がある (本実装の `load` は並列でも安全。読み込みが重複しても結果は同じ)。

## 3. 読み込まれるファイルの種類と `module.exports` の形

同梱 8 パッケージで、ゲームが `requireFromExtension` で読み込むルートは 326 ファイルある (`objects/*/config.js` 184、`levels/*/events.js` 15、`levels/**/validator.js` 127)。これらが相対 `require` で連鎖的に読む 397 ファイル (JSON 8 件を含む) を走査した。

| 種類 | 形 | 備考 |
| --- | --- | --- |
| マップ JSON、タイルセット JSON | プレーンオブジェクト (JSON) | `.json` モジュール |
| `objects/*/config.js` | オブジェクト。`init`、`onPlayerDidInteract` 等のイベントハンドラ関数、`spritesheets`、`animations` 等を持つ | 例: `twilioquest-base/objects/tq-npc/config.js`。内部で `require('./builder')` |
| `levels/*/events.js` | 関数 `(event, world) => {}` | |
| `validator.js` | `module.exports = async helper => {...}` が 121 件、`(context, ...)` 形が 3 件、`(helper, ...)` 形が 1 件 | 内部で `../../../../scripts/objectiveValidation` 等を相対 `require` する。`twilioquest-python` の 1 件のみ ES module 構文 (`import`/`export`) を含む (現行 Node `require` でも読めない、既存の不具合の可能性があり本書では扱わない) |

`package.json` を `require("../../package.json")` する箇所が 6 件、`./level.json` が 3 件ある。ローダーは JSON とともに相対パスの `package.json` も読めればよい (`main` 解決は別途実装済み)。

## 4. 内部 `require` の実態 (許可リストの根拠)

走査方法: 上記ルートから、相対 `require('./...')` を辿って到達した全ファイルの、リテラル `require('<名前>')` のうち、相対でない指定子を集計した (`node_modules` 配下は除外)。

| 指定子 | 使う拡張機能 | 種類 | 許可リスト |
| --- | --- | --- | --- |
| `path` | dev-fundamentals, javascript, open-source, python | Node 組み込み | 登録 (一時: Node 組み込み) |
| `assert` | api-academy, base | Node 組み込み | 登録 (一時: Node 組み込み) |
| `util` | dev-fundamentals, javascript, open-source | Node 組み込み | 登録 (一時: Node 組み込み) |
| `lodash.merge` | 5 パッケージ | npm (純 JS) | 登録 |
| `lodash.isequal` | base | npm (純 JS) | 登録 |
| `esprima` | javascript | npm (純 JS) | 登録 |
| `uuid` | javascript | npm (純 JS) | 登録 |
| `compare-versions` | api-academy | npm (純 JS) | 登録 |
| `fs` | api-academy, dev-fundamentals | Node 組み込み | 未登録 (拒否) |
| `fs-jetpack` | javascript, open-source, python | npm (Node の fs に依存) | 未登録 (拒否) |
| `child_process` | dev-fundamentals, javascript, open-source, python | Node 組み込み | 未登録 (拒否) |
| `vm` | javascript | Node 組み込み | 未登録 (拒否) |
| `electron` | javascript, python | Electron | 未登録 (拒否) |
| `twilio` | api-academy, javascript, twilio-vr | npm (Node 依存) | 未登録 (拒否) |
| `got` | open-source | npm (Node 依存) | 未登録 (拒否) |
| `command-exists` | javascript | npm (`child_process` 依存) | 未登録 (拒否) |
| `http`, `express`, `body-parser` | twilio-vr | Node 組み込み / npm | 未登録 (拒否)。ただし走査ではルートから到達せず、全ファイル走査でのみ出現 (ゲームから `requireFromExtension` されない `scripts/` 内) |

動的 `require` (`require(`./animations/${npcName}`)`) が `twilioquest-base/objects/tq-npc/builder.js:18` に 1 件ある。ローダーは非同期読み込みと同期 `require` を両立するため、静的に見えるリテラルだけを先読みする。この 1 件は、先読みされないため `ERR_MODULE_NOT_PRELOADED` になる。切り替え (#21) の前に、この呼び出しの扱い (`animations/*` を先読み対象に加える API の追加など) を決める必要がある。

### 重要: 拒否リストと現行同梱コンテンツの衝突

チケット #20 の要件どおり、許可リスト外 (`fs`、`child_process`、`vm`、`electron`、`twilio` など) の `require` は明示エラーにしている。しかし上表のとおり、同梱の検証関数 (特に javascript、python、open-source、dev-fundamentals の `validator.js`) はこれらを必要とする。#21 で切り替える前に、次のいずれかを決める必要がある。

1. 検証関数が必要とする機能を、プラットフォーム層経由のヘルパー (`helper` 引数など) として提供し、同梱コンテンツ側を書き換える。
2. 同梱拡張機能 (信頼できるコード) に限り、`fs-jetpack` 等を許可する別の許可リストを与える (`createModuleLoader` は許可リストを注入できる)。

この判断は本チケットの範囲外である。

## 5. 実装 (#19, #20, #22)

追加ファイル (いずれも新規。既存コードからは未参照):

- `src/js/app/common/modulePath.js`: Node の `path` に依存しない純粋なパス処理 (`isAbsolute`、`normalize`、`dirname`、`resolve`、`extname`)。
- `src/js/app/common/moduleAllowlist.js`: 許可リスト。
- `src/js/app/common/moduleLoader.js`: ローダー本体。
- `src/test/app/common/moduleLoader.test.js` と `src/test/fixtures/moduleLoader/`: 単体テストとフィクスチャ。

### ローダーの動作

- 同期 `require` と非同期ファイル読み込みの両立: `load(path)` が先に静的な依存グラフを辿り (`require('リテラル')` を正規表現で検出)、`platform/fs` の `stat` / `readFile` で必要なファイルをすべて読む。その後の評価は同期で行い、`require` は記録済みの結果を引くだけである。
- 依存の検出: 正規表現ではなく、自前の字句トークナイザ (コメント、文字列、テンプレートリテラル、正規表現リテラルを読み飛ばす) で `require(リテラル)` を探す。`require /* c */ ('x')` や `require('x',)` を検出し、`foo.require('x')` (プロパティ) とコメント内の `require` は無視する。esprima 4 は同梱 JS 478 ファイル中 31 ファイルを構文解析できない (ゲームが実際に読み込む `objects/*/config.js` のオブジェクトスプレッドなど) ため不採用にした。トークナイザの結果を単純な正規表現と全 478 ファイルで比較し、差分はコメント内の `require('twilio')` 1 件だけ (トークナイザが正しい)。
- 先読みの公開 (原子性): 先読みは、ソースと解決表を専用のステージング用 Map に作り、完了し、かつ generation が変わっていない場合にだけ、共有の Map へ 1 つの同期処理で同時に公開する。失敗または古い先読みは何も公開しない。これにより、生きているインスタンスが新しいソースと古い解決表を組み合わせて評価することはない。
- 評価済みキャッシュのバージョン: 公開するソースに単調増加のバージョンを付け、評価済みエントリには評価に使ったバージョンを記録する。エントリは、現在公開中のバージョンと一致するときだけ有効とする。無効化の後に生きているインスタンスの遅延 `require` が古いソースを評価しても、その後の `load` で新しい版が公開されれば、再評価される。ただし、無効化されていないソースから評価された有効なエントリは再公開しない (並列の `load` 同士で同じモジュールを 1 回だけ評価する)。
- 解決の結果は「要求元ファイル + 指定子」ごとに、成功と失敗の両方を記録する。失敗 (見つからない、許可されていない) は、そのモジュールが実際にその `require` を実行した時点で例外にする。Node と同様、実行されない遅延 `require` は読み込みを妨げない。握りつぶしや既定値への置き換えはない。
- 解決順 (Node のサブセット): 完全一致のファイル、`.js`、`.json`、ディレクトリ (`package.json` の `main`、`index.js`、`index.json`)。`.node`、`.mjs`、`.cjs` は非対応。`node_modules` 探索は行わない。
- 評価: `new Function('exports','require','module','__filename','__dirname', source)`。`vm` は使わない。ソース末尾に `//# sourceURL=<path>` を付ける。先頭の BOM と shebang を処理する。構文エラーはパス付きの `ERR_MODULE_SYNTAX` (`cause` に元の `SyntaxError`) にする。モジュール実行中の例外はそのまま伝播し、そのモジュールはキャッシュから外す。
- キャッシュ: 絶対パスをキーに、評価前に登録するので、循環参照は Node と同じく部分的な `exports` を受け取る。無効化 API は `invalidate(path)`、`invalidateAll()`、`isCached(path)`。無効化の契約は次のとおり。
  - `invalidate(path)` と `invalidateAll()` が消すのは、評価済みモジュールのキャッシュだけである (`delete require.cache[path]` 相当。依存先は残る)。先読み済みのソースと解決表は消さない。生きているモジュールインスタンスが、後から遅延 `require` で必要とするためである (同期の `require` はファイルを読めない)。
  - 新しい `load()` は毎回、キャッシュにないファイルをファイルシステムから読み直して先読みし、古い先読みデータを上書きする。ホットリロードする呼び出し側は `invalidate` の後に `load` を呼ぶ。
  - 結果として、既存のインスタンスが無効化の後に実行した遅延 `require` は、無効化前に先読みされた版を返すことがある (次の `load` までは古いまま)。同期読み込みができないための、受け入れたトレードオフである。先読みしたソースはローダーの存続中メモリに残る。
  - 読み込み中に `invalidate` が呼ばれた場合は、その読み込み (読み込みの失敗を含む) の結果を捨て、最初からやり直す。古いデータで共有状態を上書きすることはない。
- 組み込みモジュール: 裸の指定子は許可リストに完全一致したものだけを返す。それ以外 (`node:` 接頭辞付きを含む) は `ERR_MODULE_NOT_ALLOWED` で、指定子と要求元ファイルを含むメッセージにする。
- エラーコード: `MODULE_NOT_FOUND`、`ERR_MODULE_NOT_ALLOWED`、`ERR_MODULE_NOT_PRELOADED`、`ERR_MODULE_SYNTAX`、`ERR_MODULE_JSON`。
- パス: 内部は `/` 区切りに統一し、Windows のドライブレター (`C:\a\b` は `C:/a/b`) を扱う。UNC (`\\server\share`)、ドライブ相対 (`C:foo`)、ルートを越える `..` は明示エラー。Windows の大文字小文字は区別して扱う (実際のファイルシステムとは異なる)。

### 公開 API (#21 で使う)

```js
import { loadModule, invalidateModule, invalidateAllModules, isModuleCached, createModuleLoader } from './moduleLoader';
await loadModule(absolutePath);          // module.exports を返す。絶対パス必須
invalidateModule(absolutePath);          // 開発時の再読み込み用
```

`createModuleLoader({ readFile, stat, isAllowed, getAllowed })` で依存を差し替えられる (テストでは読み込み関数を差し替えている)。

### #21 での注意点

- `requireFromExtension` は、存在しなければ `null` を返す。ローダーは存在しないファイルに `MODULE_NOT_FOUND` を投げるので、`resolveAbsolutePath` の結果が偽のときに `null` を返す現在の分岐を、そのまま残す必要がある。
- 開発時のキャッシュ破棄 (`isDev || window.reloadExternalModules`) は、`delete require.cache[...]` を `invalidateModule(absolutePath)` に置き換える。
- 同梱ファイルは Windows でも `/` 区切りの絶対パスに正規化されるため、`__filename` の値が現行 (バックスラッシュ) と異なる。
- 許可リストの `path`、`assert`、`util` は現在 Node 組み込みである (一時的、Electron 専用)。Tauri の webview で動かす前に、`path-browserify`、`assert`、`util` の npm パッケージ (未インストール) に置き換えるフォローアップが必要。
- 4 章のとおり、`fs`、`child_process`、`vm`、`electron`、`twilio`、`got`、`fs-jetpack`、`command-exists` は未登録で、同梱の検証関数の多くが使っている。方針の決定が必要。
- 非リテラルの `require` (4 章の 1 件) は先読みできない。
- `require.cache`、`require.main`、`module.paths` は未提供。`require.resolve` は提供する (先読み済みのものだけ)。
