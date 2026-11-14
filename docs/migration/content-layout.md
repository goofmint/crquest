# Phase 5-0 / 5a: 同梱コンテンツの取り込み方式 (`content/<package>/`) と twilioquest-base の取り込み

Issue #28 (5-0: 取り込み方式の確定) と #29 (5a: twilioquest-base の取り込み) の成果物である。ゲームの挙動は変えていない (拡張機能名、レベルファイルは従来どおり)。

## 1. 配置

同梱コンテンツのパッケージは `public/content/<パッケージ名>/` に置く。

- `public/` は Electron でもTauri のバンドルでも「アプリのリソースルート」であり、`staticFilePath(...)` / `staticFileUrl(...)` が解決する基準である。`public/` 直下に置けば、静的パスの組み立て方 (`staticFilePath('content')`) は両方で変わらない。
- リポジトリルートや `src/` 配下には置かない。`src/` は babel で `public/` へ出力されるビルド入力であり、ビルド対象でないコンテンツ (画像 829 枚、JSON 262 件) を混ぜると `build:js` の対象と混同する。
- 名前は `content` とした。`node_modules` と違い、`.gitignore` の既存ルール (`node_modules`) に掛からず、npm が管理するディレクトリではないことが名前から分かる。`public/.gitignore` や `.gitignore` の追加は不要だった (取り込んだ 1309 ファイルすべてが追跡対象になることを確認済み)。
- 反対する具体的な理由は見つからなかった。`public/content` に置いても、Electron の `file://` 読み込み、`create_release.js` の `tar` (`public` 全体を固めるだけ) とも整合する。

### 1.1 中身

`public/content/twilioquest-base/` は npm の `twilioquest-base@8.1.0` の tarball の `package/` と同一である (バージョンは `public/package-lock.json` が解決していた 8.1.0。`integrity` の sha512 が tarball と一致することを確認し、既に展開済みの別コピーと全ファイルを `diff -r` して差分ゼロ)。1309 ファイル、約 8.5MB。`LICENSE` (MIT, Twilio Inc.)、`README.md`、`package.json` を残している。

- `package.json` の `files`、`dependencies` (`lodash.isequal`、`lodash.merge`) は触らない (出所の記録として原文を保つ)。
- 取り込みは「コピーしたものを以後このリポジトリで編集する」方針である。上流 (npm) との自動同期はしない。差分レビューは通常の PR で行う。

### 1.2 `scripts/` の扱い

結論: `scripts/` は取り込み、実行時にも使う。ただし `extendTilesetIds.js` だけがビルド用である。

調査で、当初の想定と異なる事実が分かった。`scripts/` はビルド専用ではない。

| ファイル | 実行時の読み込み | 備考 |
| --- | --- | --- |
| `conversationOnInteract.js` | あり (31 件のオブジェクトが `require("../../scripts/conversationOnInteract")`) | |
| `initOpenCloseFsm.js` / `FSM.js` | あり (15 件) | |
| `createChestConfig.js` | あり (14 件) | |
| `objectiveCompletionResponder.js` | あり (5 件 + `scripts/` 内) | |
| `createLaserConfig.js` | あり (3 件) | |
| `scrollSelfHorizontally.js` | あり (2 件) | |
| `extendTilesetIds.js` | なし | CLI ツール (`node scripts/extendTilesetIds.js <tileset.json> <count>`)。`require("fs").promises` を使うため、許可リストの外 |

したがって `scripts/` を除外すると fog_owl のオブジェクトが読めなくなる。ディレクトリごと取り込む。

`extendTilesetIds.js` は、来歴 (上流にあるツール) のために残し、実行時には読み込まれない。実行時に読み込まれるのは、ゲームが `requireFromExtension` する入口 (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) から相対 `require` で到達する範囲だけで、どこからも `extendTilesetIds` は参照されない。この性質は `src/test/app/common/vendoredContent.test.js` で固定している (全 `.js` の中でこのファイルを名指しするものが無いこと)。将来 `fs` を許可しない webview ローダーで全体を走査する場合も、入口からの到達グラフに入らないので影響しない。

## 2. 探索 (discovery)

### 2.1 設定

- `src/js/app/config/bundledExtensionModules.json`: 従来どおり同梱パッケージ名の一覧 (`owls-nest-extension` を含む 7 件)。
- `src/js/app/config/vendoredExtensionModules.json` (新規): そのうち、リポジトリに取り込み済みで `public/content/` から読むものの一覧 (現在は `twilioquest-base` のみ)。`config.vendoredExtensionModules` として公開する。

### 2.2 解決順序 (フォールバックなし)

パッケージごとの探索ルートは設定だけで決まり、実行時にファイルの有無で切り替えない。

1. `vendoredExtensionModules` に含まれる名前: `public/content/<名前>` のみを使う。
2. それ以外の `bundledExtensionModules` の名前: `public/node_modules/<名前>` のみを使う (取り込み前の暫定)。
3. `vendoredExtensionModules` にあって `bundledExtensionModules` に無い名前は、`getBundledExtensionDirectories()` が `Error` を投げる。
4. 両方のルートに同名が存在してしまう事態 (取り込み後に npm 依存を消し忘れる) は、`vendoredContent.test.js` が `public/package.json` の `dependencies` に vendored の名前が残っていないことと、`public/content/<名前>` が存在することを検証して防ぐ。

ルートに実体が無い場合は、従来どおり後続の読み込みがエラーになる (`isValid: true` で返し、存在確認はしない。この挙動は変えていない)。取り込みを進めるチケットは「`vendoredExtensionModules.json` に名前を追加し、`public/package.json` の依存を外し、`public/content/<名前>/` を置く」の 3 点で完結する。

### 2.3 コード上の変更

- `src/js/app/common/extensions.js`: `BUNDLED_EXTENSION_DISTRIBUTION_DIRECTORY` を廃止し、`BUNDLED_EXTENSION_VENDORED_DIRECTORY = 'content'`、`BUNDLED_EXTENSION_NPM_DIRECTORY = 'node_modules'`、`BUNDLED_EXTENSION_DIRECTORIES` (両方) を export。`getBundledExtensionDirectories()` が上記 2.2 のとおりに `absolutePath` を作る。名前順ソートは従来どおり。
- `src/js/app/common/assetLoader.js`: `isPathFromBundledExtension` と `getOwningExtensionName` は、従来 `absolutePath.includes('node_modules')` と `split('node_modules')` で判定していた。`content` は一般的な語で、ユーザーの拡張機能パスにも現れうるため部分一致は危険である。そこで、`staticFilePath(<ルート>)` + 区切り文字で始まるかどうかで判定する (`getBundledExtensionRoot`)。`syncBundledAssets` は `getBundledExtensionDirectories()` の戻り値をそのまま使うので、コード変更は無い (動作は新しい `absolutePath` に従う)。
- `src/js/app/config/config.js`: `vendoredExtensionModules` を公開。
- `tasks/utils/bundledExtensions.js`: `getBundledExtensionPaths()` (`sync:missions` が使う) が vendored を `public/content` で返す。`getNpmExtensionNames()` を追加し、`tasks/update_bundled_extensions.js` (npm の `@latest` を入れ直すスクリプト) は vendored を対象から外す (上書きして取り込みを壊さないため)。再設計はしていない。

### 2.4 `public/package.json` / `package-lock.json`

- `twilioquest-base` を `dependencies` から削除。
- `lodash.isequal` (`^4.5.0`) を `dependencies` に追加した。取り込んだ `levels/challenge-questions/objectives/03-debugging-*/validator.js` が `require("lodash.isequal")` するためで、従来は `twilioquest-base` の依存として `public/node_modules` に入っていた。`public/content/...` からの Node の解決は `public/node_modules` まで遡るので、直接の依存にしないと実体が消える。`lodash.merge` は既に直接の依存である。
- `public/package-lock.json` (lockfileVersion 1) は手で編集し、`twilioquest-base` のエントリ 9 行だけを削除した。`lodash.isequal` / `lodash.merge` の最上位エントリは残る (v1 には「直接依存」の印が無いため追加の差分は無い)。他の拡張機能 (`twilioquest-*`) の `requires` は触っていない。

## 3. テスト

- `src/test/fixtures/public/node_modules/twilioquest-base` → `src/test/fixtures/public/content/twilioquest-base` に移動 (ファイル内容は変更なし)。`twilioquest-aaa-bundled-two` は `node_modules` に残し、2 つのルートの併用を検証する。
- `extensions.test.js`: vendored が `content/`、そうでないものが `node_modules/` に解決されること、設定不整合で例外になることを追加。
- `assetLoader.test.js`: 両ルートに対する `isPathFromBundledExtension` / `getOwningExtensionName` / `getPathRelativeToOwningExtension`、名前が `content` のディレクトリを同梱ルートと誤認しないことを追加。
- `vendoredContent.test.js` (新規): 実際の `public/` に対して、レイアウト (LICENSE、README、package.json、`levels/fog_owl`、`levels/challenge-questions`)、実探索コード経由の発見、新ローダー (`moduleLoader.js` + 実際の許可リスト) での実行時入口 (`objects/*/config.js`、`levels/*/events.js`、`levels/**/validator.js`) の全件読み込みを検証する。

### 3.1 新ローダーでの読み込み結果

入口 (`objects/*/config.js` 等) の全件を、1 件ずつ独立したローダーで `load` した。失敗は 1 件のみ。

- `objects/tq-npc/config.js`: `ERR_MODULE_NOT_PRELOADED`。`objects/tq-npc/builder.js` の `require(`./animations/${npcName}`)` (動的 require) をローダーが先読みできないため。`module-loader-usage.md` の第 4 節で既に指摘済みの 1 件で、許可リストの不足ではない。`animations/*` を先読み対象に加える扱いは、切り替えチケット (#21) で決める (本 PR の範囲外。テストでこの失敗を「既知の 1 件」として固定している)。
- Node の組み込みで許可リスト外のものを要求するファイルは無かった (`twilioquest-base` が使うのは `assert`、`lodash.merge`、`lodash.isequal` のみ。`fs` は `scripts/extendTilesetIds.js` だけで、入口から到達しない)。

## 4. 後続チケットが守る規約

- 新しく取り込むパッケージは `public/content/<名前>/` に npm tarball の `package/` をそのまま置き、`LICENSE`・`README`・`package.json` を残す。
- `vendoredExtensionModules.json` に名前を追加し、`public/package.json` から依存を外し (そのパッケージの `dependencies` が他に無ければ追加する)、`package-lock.json` から該当エントリを除く。
- 実行時に読み込まれるかどうかは `scripts/` などのディレクトリ名では判断せず、入口からの `require` の到達で判断する。

## 5. 手元での確認 (アプリは起動していない)

1. `npm install` (`public/node_modules` に `twilioquest-base` が入らなくなる)。
2. `npm start` で起動し、新規ゲームが `fog_owl` から始まることを確認する。NPC との会話、扉の開閉、チェスト、`challenge-questions` の目標 (`03-debugging-*` の validator) が従来どおり動くこと。
3. 設定 > 拡張機能の一覧に `twilioquest-base` が従来どおり同梱として表示されること。
