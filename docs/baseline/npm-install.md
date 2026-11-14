# npm install ベースライン計測

計測対象: crquest main (commit 224d573) の隔離クローン。回避フラグ・設定変更なし。

## 環境
- node v18.20.8 / npm 10.8.2 (.nvmrc = 18)
- OS: Darwin 27.2.0 arm64 (Apple Silicon)
- python3 3.9.21 (PYENV_VERSION=3.9.21。マシン既定は 3.11.11)
- GNU Make 3.81 / Apple clang 21.0.0 (g++ は clang のラッパー)
- 関連する環境変数: NODE_ENV, PYTHONPATH が設定済み (値は未記録)。npm_config_* / ELECTRON_* / SASS_* / proxy 系は未設定
- ~/.npmrc は存在する (内容は未確認)。グローバル npmrc (node18 配下 etc/npmrc) は存在しない

## キャッシュ状態
| 対象 | 状態 |
|---|---|
| ~/.npm | あり (electron のメタデータは cache revalidated で取得) |
| ~/Library/Caches/electron, ~/.cache/electron | なし (Electron 11.5.0 バイナリ未キャッシュ) |
| ~/.node-gyp | あり (対応バージョンの有無は未確認) |
| node-sass バイナリキャッシュ | なし |

## 実行コマンド
`NODE18_DIR` は Node 18.20.8 を展開したディレクトリに置き換える（例: `$HOME/node-v18.20.8-darwin-arm64`）。

```
NODE18_DIR="$HOME/node-v18.20.8-darwin-arm64"
export PATH="$NODE18_DIR/bin:$PATH" PYENV_VERSION=3.9.21
cd install-baseline
npm install --loglevel verbose --foreground-scripts > install-baseline.log 2>&1
```

## 結果
- 終了コード: 1 (所要約 0.8 秒。依存ツリー解決の段階で失敗し、node_modules は未作成)
- 最初のエラー: `npm error code ERESOLVE` (ERESOLVE could not resolve)
- 失敗パッケージ: `@electron/remote@2.0.9` の peer `electron@">= 13.0.0"` と、ルートの `electron@^11.5.0` (解決済み 11.5.0) の衝突
- ライフサイクルステージ: ライフサイクルスクリプト以前 (Arborist の buildIdealTree / place-dep の peer 競合)
- postinstall (`cd public && npm install`) には到達せず。public/ で使われる npm のバージョンは確認不能 (ルートの node_modules/.bin/npm 6.14.8 は未インストール)
- lockfile 差分: `git status --short` / `git diff --stat` ともに出力なし (追跡ファイルの変更なし)
- ログ: install-baseline.log (npm 側 debug ログと eresolve-report は ~/.npm/_logs)
- 補足: 診断用の再実行は行っていない。原因が ERESOLVE で明確なため

## 要因の分類表
| 分類 | 項目 | 根拠 |
|---|---|---|
| 確認済みの失敗 | peer-dep ERESOLVE: @electron/remote 2.0.9 (peer electron >=13) vs electron 11.5.0 | ログの `npm error code ERESOLVE` と `peer electron@">= 13.0.0" from @electron/remote@2.0.9` / `Found: electron@11.5.0`。npm 7+ は peer 依存を自動解決し、衝突すると停止する |
| 静的リスク (未発生) | node-sass 8.0.0 のバイナリ取得 vs node-gyp 再ビルド | 失敗が解決段階のため install スクリプト未実行。lockfile は node-sass 8.0.0。Electron 11 / Node 18 / arm64 向けの prebuilt があるかは未確認。取得できなければ node-gyp 再ビルドとなり Python / Xcode CLT に依存する。README は Python 3.11 で問題が出ると記載 |
| 静的リスク (未発生) | Electron 11.5.0 バイナリのダウンロード | Electron のキャッシュなし。postinstall での取得は未到達。darwin-arm64 向け 11.5.0 の配布状況は未確認 |
| 静的リスク (未発生) | fsevents | lockfile は fsevents 1.2.11 (darwin 専用 optional)。旧版は新しい Node / arm64 でビルドに失敗する場合がある。optional のため致命とは限らないが未検証 |
| 静的リスク (未発生) | ルート devDependency `npm ^6.14.8` | lockfile は npm 6.14.8。public/ の postinstall で使われる npm が 10.8.2 か 6.14.8 かは未確定 |
| 静的リスク (未発生) | public/ の依存 (lockfileVersion 1) | 未到達。npm 10 での解決結果は未確認 |
| 未確定 | ~/.npmrc の内容の影響 | 存在のみ確認。今回のエラーとの関連は ERESOLVE の内容上はなさそう |
| 未確定 | ERESOLVE 解消後に後続の失敗があるか | 本計測では検証していない |

## 実装しない候補
このチケットでは修正しない。将来の検討候補として記録する。
- Electron 13 以上への更新、または @electron/remote の利用見直し (peer 要件 electron >=13 と現行 electron 11 の根本的な食い違いを解消する)
- node-sass から sass (Dart Sass) への移行 (ネイティブビルドとバイナリ取得の依存をなくす)
- ルート devDependency の npm (^6.14.8) の見直し (postinstall で使う npm の挙動を明確にする)

`--legacy-peer-deps`、`--force`、バイナリのダウンロードスキップ (ELECTRON_SKIP_BINARY_DOWNLOAD, SKIP_SASS_BINARY_DOWNLOAD_FOR_CI) は、いずれも問題を隠すだけの回避策である。推奨しない。

## 範囲外
npm test / build:all は別チケット。install は失敗したため node_modules が存在せず、それらは実行不能。
