# Phase 2-1: 同期 fs-jetpack API (exists / read / list) 呼び出し元の棚卸し

Issue #12 の成果物である。チケット本文は成果物を `.tmp/sync-api.md` としているが、このリポジトリでは `.tmp/` が未追跡であるため、コミット対象の場所として `docs/migration/sync-api.md` に置く。

本書はアプリケーションコードを一切変更しない。後続の Phase 2 チケット (#13〜#17) が、同期 API を非同期 API へ置き換える際の影響範囲と作業順序を決めるための調査記録である。

- 調査対象コミット: `14f29a3` (main, #87 マージ後)
- 注意: CodeRabbit が作成した実装計画は、#9 で追加された `src/js/app/platform/fs.js` のマージ前の状態を前提にしており、行番号や件数が古い。本書の数値は現行コードで再計測した値であり、計画の「40 式」とは一致しない。

## 1. 結論の要約

現行コード (`src/`, `tasks/`, `main.js`, `public/code_runner`, `public/levels`) で、`exists` / `read` / `list` の同期版を呼ぶ式は 48 個、非同期版 (`…Async`) を呼ぶ式は 23 個である (`platform/fs.js` の再エクスポート定義は除く)。48 個の内訳は次のとおり。

| 区分 | 同期式の数 | Phase 2 の対象 |
| --- | --- | --- |
| レンダラ実行時コード (`src/js`) | 9 | 対象 (#13, #14, #15) |
| コードランナー (`public/code_runner/runner.js`) | 1 | 対象外 (理由は 5 章) |
| テスト (`src/test`) | 17 | 対象外 |
| 開発用 CLI (`tasks/`) | 21 | 対象外 |

`src/js` の 9 個のうち、`sfExists` (`fs_utils.js:25`) は呼び出し元が 0 件である。実際に同期依存が残る箇所は次の 4 ファイルに限られる。

1. `src/js/app/common/audio/index.js` (`list` 2 箇所): 呼び出しがモジュールのトップレベル (`src/js/index.js`) にある。
2. `src/js/app/components/game/Game.jsx` (4 箇所): すでに `async` コールバック内にあり、変更範囲が局所的である。
3. `src/js/app/components/game/InteractionTextService.js` (1 箇所): Phaser の `preload()` から呼ばれる。同期ライフサイクルの制約があり、最もリスクが高い。
4. `src/js/app/components/context_provider/loadItemsFromDisk.js` (1 箇所): すでに `async` コールバック内にあり、最もリスクが低い。

## 2. 実行したコマンド

すべてリポジトリのルートで実行した。`git grep` は追跡ファイルだけを検索する。macOS の `git grep -E` では `\b` が効かなかったため、`-P` (PCRE) の否定後読みで語境界を表現した。

```sh
# 1) 呼び出し式の全件 (同一行の複数回出現、行頭が `.list(` の複数行呼び出しを含む)
git grep -n -P "(?<![A-Za-z0-9_])(exists|read|list)(Async)?\s*\(" \
  -- src tasks main.js public/code_runner public/levels \
  | grep -v "src/js/app/platform/fs.js"

# 2) 複数行にまたがる呼び出し (`jetpack` の次の行が `.list(` など)
git grep -n -P "^\s*\.(exists|read|list)(Async)?\(" -- '*.js' '*.jsx'

# 3) import / require の経路 (platform/fs の名前付き import、`import * as jetpack`、alias)
git grep -n -E "fs-jetpack|jetpack|platform/fs|sfExists" -- . ':!package-lock.json' ':!*.md'
git grep -n -P "require\(['\"](fs-jetpack|fs|node:fs)['\"]\)" -- '*.js' '*.jsx'
git grep -n -P "from ['\"](fs-jetpack|fs|node:fs)['\"]" -- '*.js' '*.jsx'

# 4) 関数参照渡し (`.then(jetpack.read)` など) と添字アクセス
git grep -n -P "(?<![A-Za-z0-9_])(exists|read|list)(Async)?(?![A-Za-z0-9_(])" -- src/js tasks main.js public/code_runner
git grep -n -P "(jetpack|fs)\s*\[" -- src tasks main.js public/code_runner

# 5) jetpack 以外の同期 Node fs
git grep -n -E "(readFileSync|existsSync|readdirSync|statSync|accessSync|lstatSync)" -- '*.js' '*.jsx' ':!package-lock.json'

# 6) html / json への埋め込みとフィクスチャ
git grep -n -E "jetpack|readFileSync|fs-jetpack" -- '*.html' '*.json' ':!package-lock.json' ':!public/package-lock.json'
git grep -n -E "(exists|read|list)(Async)?\s*\(" -- src/test/fixtures

# 7) 呼び出し元の追跡 (例)
git grep -n -E "loadMusic|loadSfx|loadItemsFromDisk|InteractionTextService|sfExists|loadLevel\(" -- src
```

件数は、1) の出力を同期 (`Async` なし) と非同期に機械的に分類して集計した。`Jimp.read(...)` (`src/js/app/common/avatarRenderer.js:44-65`、画像ライブラリの Promise API) と `doc.exists` (`Validator.jsx:277`、Firestore のプロパティ) は fs-jetpack ではないため集計から除いた。

分類の規則: メソッド名が `exists` / `read` / `list` なら同期、`existsAsync` / `readAsync` / `listAsync` なら非同期とする。`await jetpack.read(...)` のように同期メソッドに `await` が付いている式は、`await` があっても同期として分類する (`tasks/` に 10 件ある。詳細は 4.3 節)。

## 3. fs-jetpack 2.2.2 の意味論

レンダラが使うのは `public/node_modules` の fs-jetpack 2.2.2 である (`public/package-lock.json:2033-2035`)。ルート `package.json:50` は `^2.2.3` を指すが、そのコピーは `tasks/` とテストから使われる。このワークツリーには `node_modules` がないため、2.2.2 のソース (`lib/exists.js`, `lib/list.js`, `lib/read.js`, `lib/jetpack.js`) は `unpkg.com/fs-jetpack@2.2.2/` から取得して読んだ。

| API | 戻り値 | パスが存在しない場合 | その他のエラー |
| --- | --- | --- | --- |
| `exists(path)` | `'dir'` / `'file'` / `'other'` / `false` | `false` | `ENOENT` 以外は throw |
| `list(path)` | ファイル名の配列 | `undefined` | `ENOENT` 以外は throw (`ENOTDIR` など) |
| `read(path, returnAs)` | 文字列 (`'utf8'` 既定) / Buffer / パース済み JSON | `undefined` | `ENOENT` 以外は throw。`'json'` の JSON パース失敗は `JSON parsing failed while reading ...` の `Error` を throw |

非同期版 (`existsAsync` / `listAsync` / `readAsync`) の戻り値と欠損時の扱いは、同期版と同一である。つまり、欠損は `false` / `undefined` で解決され、`ENOENT` 以外は reject される。変換で欠損時の挙動は変わらない。

変換時に注意すべき差異は次の 2 点である。

1. 引数検証は非同期版でも同期的に throw される。`jetpack.js` は `exists.validateInput("existsAsync", path)` を Promise を返す前に呼ぶ。パスが文字列でない場合 (`exists` / `read`)、Promise の reject ではなく同期例外になる。`await` を `try` の中に置けば両方とも捕捉できる。
2. 同期版はファイル読み込みと解析の全体でイベントループをブロックする。非同期版はファイルの読み込みはブロックしないが、`readAsync(path, 'json')` は読み込み後の `JSON.parse` を同期的に実行するため、大きな JSON では解析の間だけイベントループが止まり得る (fs-jetpack 2.2.2 `lib/read.js`)。ここで扱う設定ファイルは小さいので実害は小さい見込みだが、「非同期版は一切ブロックしない」とは言えない。この違いにより、呼び出し側が「呼び出し直後に結果が揃っている」ことを暗黙に前提にしている場合に、実行順序が変わる (4 章の各行を参照)。

`platform/fs.js` の `exists` / `list` / `read` / `…Async` は、jetpack の関数をそのまま再エクスポートしているだけである (`src/js/app/platform/fs.js:60-65`)。ラップはないため、上の意味論がそのまま適用される。

## 4. 同期呼び出し一覧

リスクの基準: 高は起動経路または Phaser の同期ライフサイクルに依存しており、変換で挙動が変わる可能性が高いもの。中は呼び出し連鎖の変更が必要、または実行順序が変わり得るもの。低は既存の `async` 関数内で `await` を足すだけで済むもの。

### 4.1 レンダラ実行時コード (`src/js`, 9 件、Phase 2 の対象)

| 箇所 | API | 周辺の関数と呼び出し連鎖 | 非同期化に必要な変更 | リスク |
| --- | --- | --- | --- | --- |
| `src/js/app/common/audio/index.js:158` | `list` (platform/fs 経由) | `AudioManager.loadSfx()` (同期メソッド、155 行)。唯一の呼び出し元は `src/js/index.js:197` のモジュールトップレベル。`list(...).forEach` の後に `this.sfx.register` と `this.sfx.load()` を呼ぶ | `loadSfx` を `async` にし、`index.js:197` の呼び出しで Promise を扱う (トップレベル `await` を使えるかはビルド設定を未確認)。`audioManager.onload` の代入 (`index.js:198`) は同期で先に実行されるため、完了通知は取りこぼさない | 高 |
| `src/js/app/common/audio/index.js:180` | `list` (platform/fs 経由) | `AudioManager.loadMusic()` (177 行)。呼び出し元は `src/js/index.js:196` のモジュールトップレベル。構造は `loadSfx` と同じ | `loadSfx` と同様。`loadMusic` / `loadSfx` の両方が完了して初めて `audio.loaded` が立ち、`attemptAppRender()` が `ReactDOM.render` を呼ぶ (`index.js:177-202`) | 高 |
| `src/js/app/common/fs_utils.js:25` | `exists` (platform/fs 経由) | `sfExists(relativePath)` (23 行)。`git grep sfExists` の結果は定義 1 件のみで、呼び出し元は 0 件 | 呼び出し元がないため、変換の影響はない。削除するか非同期化するかは別途判断する (本チケットの範囲外) | 低 |
| `src/js/app/components/context_provider/loadItemsFromDisk.js:19` | `exists` (platform/fs 経由) | `async` の `itemDirs.map(async dirName => ...)` コールバック内 (15 行)。`loadItemsFromDisk` は `ContextProvider.jsx:99` の `pipeAsync` 内で `await` される | `exists` を `await existsAsync` に置き換えるだけ。呼び出し連鎖の変更は不要 | 低 |
| `src/js/app/components/game/Game.jsx:219` | `list` (platform/fs 経由) | `loadLevel(level)` (91 行) 内の `setTimeout(async () => {...})` コールバック (110 行) の中。式は 219-220 行にまたがる (`list(commonEntitiesDir)` の次の行が `.map(`)。`loadLevel` の呼び出し元 (`Game.jsx:39`, `:62`) は結果を待たないため、呼び出し元の変更は不要 | `await listAsync(...)` にし、`.map` を `Promise.all(... .map(async ...))` に変える。`list` が `undefined` を返す場合の `.map` の TypeError は現行と同じ | 中 |
| `src/js/app/components/game/Game.jsx:222` | `exists` (platform/fs 経由) | 同コールバック内の `.map` コールバック (220 行) の中 | `await existsAsync(...)`。`.map` コールバックを `async` にする必要がある | 中 |
| `src/js/app/components/game/Game.jsx:230` | `exists` (platform/fs 経由) | 同上 | 同上 | 中 |
| `src/js/app/components/game/Game.jsx:238` | `read` (platform/fs 経由) | 同上。237-250 行の `try` / `catch` の内側で、`EntityConfigService.register` (239 行) と同じ `try` に入っている | `await readAsync(configPath, 'json')` にする。`await` を `try` の内側に置けば、JSON パース失敗の `catch` (245 行) は維持される | 中 |
| `src/js/app/components/game/InteractionTextService.js:14` | `read` (platform/fs 経由) | `InteractionTextService.load(interactionDirPath)` (11 行)。唯一の呼び出し元は `DynamicLevel.js:86` の `preload()` (61 行)。`preload()` は Phaser の状態コールバックで同期実行される (`DynamicLevel.js:39` で `preload: () => this.preload()` を登録)。レベル切り替え時は `Game.jsx:328` の `state.restart()` で再実行される | Phaser の `preload()` は Promise を待てないため、`load` を `async` にするだけでは足りない。`Game.jsx` の非同期区間 (`spriteSheets` / `legacyEntityConfigs` を先読みして `DynamicLevel` に渡している部分) でファイルを先読みし、結果を `DynamicLevel` に渡す構成が必要になる。この場合 `new DynamicLevel({...})` の引数 (`Game.jsx:330-341`) と、既存インスタンスへの代入 (`Game.jsx:315-328`) の両方に項目が増える | 高 |
| (参考) `src/js/app/components/context_provider/itemsHelper.js` | なし | fs-jetpack の呼び出しはない (`getContext` / `setContext` のみ)。#15 のタイトルには `itemsHelper` が含まれるが、本調査の grep では同期 fs 呼び出しを検出できなかった | 変換の対象となる式はない。#15 の対象は `loadItemsFromDisk.js` と `InteractionTextService.js` だけになる見込み | 該当なし |

高リスクとした理由は次のとおり。

- `audio/index.js`: 現状でも `list` が `undefined` を返す (ディレクトリ欠落) と `.forEach` が TypeError を投げ、モジュールトップレベルの例外としてアプリ起動が止まる。非同期化すると、同じ失敗が unhandled rejection に変わり、`audio.loaded` が立たないまま画面が描画されない (空白画面) 状態になる。失敗を握りつぶさず、明示的に伝播させる設計が必要になる。
- `InteractionTextService.js`: `defaultTextList` の初期値は `[]` である (7 行)。先読みが間に合わなかった場合、`getText` は例外を出さずに `undefined` を返す (`TileObject.js:36`, `:63` の呼び出し)。つまり、変換に失敗すると、エラーなしでフレーバーテキストが出なくなる (サイレントな退行)。

### 4.2 コードランナー (`public/code_runner/runner.js`, 1 件、対象外)

| 箇所 | API | 周辺 | 備考 |
| --- | --- | --- | --- |
| `public/code_runner/runner.js:101` | `read` (`require('fs-jetpack').read(...)` のインライン require) | `ipcRenderer.on('runWithEnv', (event, payload) => {...})` の同期コールバック内 (81 行)。ユーザーコードを読み込み、直後に VM で実行する | `src/js` の外にあり、`platform/fs` を経由せず、`import` ではなくインライン `require` のため、境界チェック (`npm run check:platform`) の対象にも入らない。5 章を参照 |

### 4.3 開発用 CLI (`tasks/`, 21 件、対象外)

すべて Node 製の開発用スクリプトであり、アプリの実行時には読み込まれない。`await jetpack.read(...)` のように同期メソッドへ `await` を付けている箇所が 10 件ある (`generate_warp_points/readLevels.js` の 26, 46, 66, 84, 97 行、`utils/readLevels.js` の 24, 60, 83, 96, 111 行)。`await` は同期値に対しては無意味であり、同期呼び出しとして分類した。

| 箇所 | API | 備考 |
| --- | --- | --- |
| `tasks/generate_voice_overs/build_file_list.js:22` | `list` | `readConversationFiles` 内 |
| `tasks/generate_voice_overs/build_file_list.js:42` | `exists` | `convertConversationsDirToFileList` 内 |
| `tasks/generate_voice_overs/build_file_list.js:62` | `exists` | `doesDirExist` 内 |
| `tasks/generate_voice_overs/helpers.js:5` | `exists` | `isDir` (アロー関数) |
| `tasks/generate_voice_overs/parse_options.js:89` | `list` | `getAllMissionNames` 内。式は 88-89 行にまたがる (`jetpack` の次の行が `.list(MISSION_DIR)`) |
| `tasks/generate_warp_points/readLevels.js:19` | `exists` ×2 | `isValidLevel` 内 (同一行に 2 式) |
| `tasks/generate_warp_points/readLevels.js:26` | `read` | `await` 付き |
| `tasks/generate_warp_points/readLevels.js:46` | `list` | `await` 付き |
| `tasks/generate_warp_points/readLevels.js:50` | `exists` | `filter` コールバック内 |
| `tasks/generate_warp_points/readLevels.js:66` | `read` | `await` 付き |
| `tasks/generate_warp_points/readLevels.js:84` | `read` | `await` 付き |
| `tasks/generate_warp_points/readLevels.js:97` | `read` | `await` 付き |
| `tasks/utils/readLevels.js:12` | `exists` ×2 | `isValidLevel` 内 (同一行に 2 式) |
| `tasks/utils/readLevels.js:24` | `read` | `await` 付き |
| `tasks/utils/readLevels.js:44` | `exists` | `filter` コールバック内 |
| `tasks/utils/readLevels.js:60` | `read` | `await` 付き |
| `tasks/utils/readLevels.js:83` | `list` | `await` 付き |
| `tasks/utils/readLevels.js:96` | `read` | `await` 付き |
| `tasks/utils/readLevels.js:111` | `read` | `await` 付き |

`tasks/generate_warp_points/readLevels.js` と `tasks/utils/readLevels.js` はほぼ同じ内容の重複ファイルである。

### 4.4 テスト (`src/test`, 17 件、対象外)

| 箇所 | API | 備考 |
| --- | --- | --- |
| `src/test/setup.js:22` | `read` | jest の setup。Phaser / firebase のスクリプトを読み込んで `window.eval` する |
| `src/test/app/common/assetLoader.test.js:274, 295, 298, 313, 328, 342, 357, 374` | `list` / `read` / `exists` | `import jetpack from 'fs-jetpack'` (default import)。検証用のヘルパとして使用 |
| `src/test/app/platform/fs.test.js:11, 12, 13, 23, 26, 37, 41, 58` | `exists` / `list` / `read` | `platform/fs` の同期 API の契約テスト。同期版を直接検証するのが目的であり、置き換え対象ではない |

`src/test/fixtures` 配下 (`public/node_modules/**` を含む追跡済みの 31 ファイル) には、`exists` / `read` / `list` の呼び出しはなかった (コマンド 6)。

### 4.5 参考: 非同期版の呼び出し (23 件、変換不要)

`src/js/app/common/extensions.js:45, 58, 136, 144`、`src/js/app/components/QuestIDE.jsx:74, 76`、`public/levels/common/dev_skills/objectives/terminal_cd/validator.js:14`、`.../terminal_pwd/validator.js:13`、`src/test/app/platform/fs.test.js:17, 18, 19, 30, 33, 48, 49`、`tasks/generate_warp_points/readLevels.js:61, 82, 90, 111`、`tasks/utils/readLevels.js:55, 94, 102, 144`。

### 4.1 `Game.jsx` の `loadLevel` に既に存在する競合と、移行による影響

`loadLevel` (`Game.jsx:91`) の呼び出し元 (`Game.jsx:39`, `:62`) は完了を待たない。`loadLevel` の `setTimeout` コールバックは、すでに複数の `await` (オブジェクトの読み込み、タイルセットの読み込み、`audioManager.loadLevelAudio` など) を挟んだあとに `this.level` を更新するか、新しい `DynamicLevel` を生成する。世代番号や取り消しの仕組みはない。

- 現行コードでも、先に始まった読み込みが後から完了すると、古いレベルの値で `this.level` を上書きし得る。両方の読み込みが `this.level` 未設定のまま完了すると、同じ `game` コンテナに `DynamicLevel` が 2 つ生成され得る
- この競合は移行前から存在する。このドキュメントはドキュメントのみの変更で、アプリのコードは変更しない
- #14 などで `list` / `exists` / `read` を非同期版に変えると、`await` の地点が増えるため、この競合が起きる時間窓が広がり得る。「呼び出し元の変更は不要」は、型や呼び出し連鎖の話であり、タイミングの安全性を保証するものではない
- 対応が必要になった場合は、世代番号によるキャンセルなどを別チケットで検討する (#14 では、同期のときと同じ処理順序を保つために、エンティティを 1 件ずつ `await` する形にしている)

## 5. 対象外とする同期利用とその理由

| 箇所 | 理由 |
| --- | --- |
| `src/js/app/components/hack_interface/validator/ValidationHelper.js:236` (`existsSync`) | fs-jetpack ではなく Node の `fs` である。コメント (225-235 行) のとおり、Windows ストアアプリの `WindowsApps` 配下で jetpack の `exists` (内部で `fs.stat`) が失敗する不具合を避けるために意図的に Node の `fs.existsSync` を使っている。`isExecutableValid` はすでに `async` だが、置き換えると上記の挙動が変わるおそれがある。`platform/fs.js` の JSDoc も、このファイルは未移行と明記している |
| `src/js/app/components/context_provider/system.js:25` (`readFileSync('/proc/cpuinfo')`) | Node の `fs` である。Raspberry Pi の判定のために `/proc/cpuinfo` を読み、失敗を `try` / `catch` で `false` にしている。fs-jetpack の `exists` / `read` / `list` ではない |
| `public/code_runner/runner.js:101` | `src/js` の外にあるコードランナーで、別の Electron ウィンドウ内で動く。`platform/fs` を使えず、インライン `require` のため既存の境界チェックも対象にしていない。別の経路で扱う (Phase 2 では変更しない) |
| `src/test/**` (17 件) | テストコード。同期呼び出しが実行時の挙動に影響しない。`fs.test.js` は同期 API の契約そのものを検証している |
| `tasks/**` (21 件) | Node 製の開発用 CLI であり、Tauri への移行対象のレンダラ実行時コードではない。`jetpack` は `tasks/` の依存として残る |
| `tasks/audit_items.js:8,11`, `tasks/create_release.js:128` (`lstatSync` / `readdirSync` / `statSync`) | 開発用 CLI の Node `fs` 同期呼び出し。jetpack の `exists` / `read` / `list` ではない |
| `src/js/app/components/ClearDataButton.jsx:42` (`jetpack.remove`) | `exists` / `read` / `list` ではない同期 API (`remove`)。本チケットの調査対象外 |

## 6. 後続チケットの変換順序案

依存関係とリスクから、次の順序を提案する。各チケットは独立して変更できるが、`Game.jsx` を触る #14 と #15 (`InteractionTextService`) は同じファイルを変更するため、直列にする。

1. #15 の前半 (`loadItemsFromDisk.js:19`): 既存の `async` コールバックに `await existsAsync` を足すだけで、呼び出し連鎖の変更がない。変換パターンを先に確立できる (リスク低)。
2. #14 (`Game.jsx:219, 222, 230, 238`): すでに `async` コールバック内で、`loadLevel` の呼び出し元の変更は不要。`.map` を `Promise.all` に変える際は、`EntityConfigService.register` (239 行) の登録順と `console.error` の出力順が変わらないかを確認する。`Promise.all` の結果配列の順序は保たれるが、副作用の実行順は並行実行になる。
3. #15 の後半 (`InteractionTextService.js:14`): #14 で `Game.jsx` の先読みパターンが整ってから、同じ区間に先読みを足し、`DynamicLevel` へ渡す。Phaser の `preload()` を `async` にできない点が制約。リスクが高いため、手動確認 (レベル切り替え後にフレーバーテキストが出ること) が必須である。
4. #13 (`audio/index.js:158, 180`): 起動経路 (`index.js` のトップレベル) に関わるため、他の変換が終わってから行う。`audioManager.onload` の代入が `loadMusic` / `loadSfx` の完了より前に実行される順序を維持し、失敗を握りつぶさずに伝播させる。
5. #16 (`showMessageBoxSync`): fs-jetpack ではない。`src/js/index.js:16-22` の `window.confirm` / `window.alert` の上書きが `platform/dialog.js:37, 49` の `showMessageBoxSync` を呼ぶ。`window.confirm` の呼び出し元 (`ClearDataButton.jsx:24, 27`、`HUDBar.jsx:83`、`QuestIDE.jsx:169`) はすべて戻り値の真偽を同期的に使うため、非同期化すると呼び出し元の変更が必要になる (`window.alert` の呼び出し元は `src/js` に見つからなかった)。この調査の範囲外なので、リスクの評価は #16 で行う。
6. #17 (アプリバージョン取得): fs-jetpack ではない。`platform/paths.js:63` の `getAppVersion()` は `remote.app.getVersion()` を同期で呼ぶ。呼び出し元は `analytics.js:29` (`initializeAnalytics` 内)。`getGamePackageVersion()` (`paths.js:70`) は `require` で `package.json` を同期読み込みし、`gameEvents.js:6` と `Settings.jsx:21` がモジュールのトップレベルで呼ぶ。この 2 つの扱いは #17 で調査する。

## 7. 未確認の範囲

- ビルド設定 (トップレベル `await` を使えるか): `src/js/index.js` でトップレベル `await` が使えるかは確認していない。#13 で判断する。
- 拡張機能 (extension) が持つ JS: `requireFromExtension` (`assetLoader.js:221`) は拡張機能ディレクトリの JS を実行する。ユーザーの拡張機能が fs-jetpack を呼ぶ可能性はあるが、リポジトリ外のコードのため調査できない。
- 動的アクセス: `jetpack[name](...)` のような添字アクセスをコマンド 4 で検索し、該当はなかった。ただし、文字列を組み立てた `require` の動的解決は grep で網羅できない。
- フィクスチャ: `src/test/fixtures` (31 ファイル) は、コマンド 6 で内容を検索して該当がないことを確認した。
- ビルド生成物 (`public/index.js`, `public/app/` など): `.gitignore` で除外されており、追跡されていないため検索していない。
- 実行時の挙動: 本書は静的な調査である。アプリの起動 (`npm start`) は行っていない。呼び出し連鎖はソースを読んで追跡したものであり、実行して確認したものではない。
- fs-jetpack 2.2.2 のソースは、このワークツリーに依存が未インストールだったため、`unpkg.com` から取得して読んだ。`public/package-lock.json` が示すバージョンと一致することを `package.json` の `"version": "2.2.2"` で確認した。
