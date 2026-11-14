# Phase 5a-2: owls-nest-extension の取り込み

Issue #80。`owls-nest-extension@1.0.10` (`public/package-lock.json` が解決していた版。tarball の `integrity` が一致することを確認済み) を `public/content/owls-nest-extension/` に取り込んだ。新規ゲームの開始レベル (プロローグ) `owls_nest` を提供するパッケージである。

## 1. 取り込み

- 1 つ目のコミットは tarball の `package/` と同一の 54 ファイルのみ (改変なし)。2 つ目のコミットで設定、テスト、文書を変更した。
- 実行時に読み込まれる JS (`levels/owls_nest/events.js` とその `events/*.js`、`objectives/*/validator.js`、`objects/*/config.js`、`scripts/objectiveCompletionResponder.js`、計 16 ファイル) は、相対パスの `require` (`events.js` から `./events/*`) 以外に `require` を持たない。Node 専用 API も外部モジュールも使っていないため、**コンテンツの書き換えは不要**だった。
- `vendoredExtensionModules.json` に名前を追加し、`public/package.json` から依存を、`public/package-lock.json` から `owls-nest-extension` のエントリを削除した (他のパッケージが必要とするエントリは無い)。
- `bundledExtensionModules.json` は変更していない (`twilioquest-base` の次の 2 番目のまま。レベルの探索順が変わらない)。

## 2. 開始レベルの経路 (変更なし、確認のみ)

- `config.js`: `defaultLevelNamePrologue: 'owls_nest'`、`prologueMissionStateKey: 'com.terminalquest.owls_nest'`。
- `Game.jsx` と `levelLoader.js` は、`levelState[prologueMissionStateKey]` の `shouldSkipPrologue` と `missionComplete` が両方とも偽のときに `owls_nest` から開始する。レベル名は探索で解決されるので、`content/` から読めればそのまま動く。
- プロローグをスキップ、または完了すると `world.warp("fog_owl")` で `twilioquest-base` の `fog_owl` に進む (`handleSkipPrologue.js`)。

## 3. テスト

`src/test/app/common/vendoredOwlsNest.test.js`:
- レイアウト (bundled、vendored、npm 依存でない、`package.json` の版、`level.json` の存在)。
- 実際の探索コード (`getBundledExtensionDirectories`、`readDirectory`) が `public/content` から `owls_nest` を見つけること。
- `config.js` の開始レベル設定が `owls_nest` であること、スキップ先 `fog_owl` が `twilioquest-base` にあること。
- 実行時入口の全ファイルを新ローダー + 実際の許可リストで読み込めること (失敗 0 件)、相対パス以外の `require` が無いこと。

## 4. 学習者への影響

なし。コンテンツは原文のままで、読み込み元が `node_modules` から `content` に変わっただけである。

## 5. 手元での確認 (アプリは起動していない)

1. セーブデータを新規に作って起動し、`owls_nest` (フクロウの巣) から始まること。
2. 移動チュートリアル、ハッキングツール、消火器のミッションを最後まで遊べること。
3. プロローグ完了後 (またはスキップ時) に `fog_owl` へ進み、続きが遊べること。
4. 起動時のコンソールにモジュールやレベルの読み込みエラーが出ていないこと。
