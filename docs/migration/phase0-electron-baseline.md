# Phase 0-4: Electron 版 起動確認ガイド(リグレッション基準)

Electron から Tauri への移行前に、現行の Electron 11 版 TerminalQuest で「何が動き、何が壊れているか」を人間が手動で確認し、基準として記録するためのガイドである。

注意: 本書は手順とテンプレートだけを含む。確認結果はまだ一件も記録されていない。結果は人間が起動して報告した内容のみを、第5章に追記する。

## 1. 目的と対象

- 目的: 移行後の Tauri 版と比較できるよう、現行版の動作を各マイルストーン単位で記録する。
- 対象バージョン(リポジトリのファイルで確認済み)
  - Electron: `package.json` の `"electron": "^11.5.0"`(`docs/baseline/npm-install.md` では 11.5.0 に解決)
  - Node.js: 18(`.nvmrc` は `18`、README も Node 18 でテスト済みと記載)
  - Python: 3.9 を推奨(README の記載。3.11 は問題が出ることがあるとされる)。node-sass のビルドに必要
  - リポジトリ状態: main の `decd706`(#74 で未使用の `@electron/remote` 依存を削除済み)以降
- 起動の仕組み: `npm start` は `build:all` の後に `launch`(`electron .`)と `watch:all` を並列実行する。`main.js` が `public/index.html` を 1280x800 のウィンドウで読み込む。開発モード(`electron-is-dev`)では React DevTools の自動インストールを試みるため、ネットワークがない環境ではコンソールに `An error occurred:` が出る可能性がある(`main.js`)。

## 2. 事前準備と起動手順

### 2.1 準備

1. Node 18 を用意する(nvm 利用例)。
2. Python 3.9 を用意する(pyenv 利用例)。macOS では Xcode Command Line Tools も必要になる(`docs/baseline/build-and-test.md` で node-sass が node-gyp で再ビルドされたと記録されている)。
3. セーブデータの扱いを決める(2.3 参照)。

```sh
nvm install 18 && nvm use 18
export PYENV_VERSION=3.9.21   # 手元にある 3.9.x に合わせて変更する
node -v && npm -v && python3 --version
```

### 2.2 インストールと起動

```sh
cd path/to/crquest   # リポジトリのルートに置き換える
npm install
npm start
```

- #74 で `@electron/remote` を削除した後は、Node 18.20.8 / npm 10.8.2 の素の `npm install` が成功することを隔離クローンで確認済みである（回避フラグなし。`npm run build:all` も成功）。失敗した場合は出力全文を報告に貼ること。`--legacy-peer-deps` や `--force` は使わない。
- 過去の記録(`docs/baseline/npm-install.md`)では、#74 以前の素の `npm install` は `@electron/remote@2.0.9` の peer 依存で ERESOLVE となった。
- `postinstall` で `public/` 配下の `npm install` も自動実行される。
- `npm test` は 4 suite / 39 テストがすべて通過する(#75 で修正済み。以前の 3 suite の失敗は、テスト用ウィンドウで `remote` が無効だったことと、`foo` フィクスチャの欠落が原因で、アプリ本体の不具合ではなかった。経緯は `docs/baseline/build-and-test.md` を参照)。今回の起動確認では `npm test` は必須ではない。
- `npm start` は開発サーバとして `watch` 系プロセスが残り続ける。確認が終わったらターミナルで Ctrl+C を押して止める。
- `.env` と `src/js/app/config/local_config.js` は任意である。`.env` は `tasks/` 配下のスクリプト(`create_release.js` など)が `dotenv` で読む。`local_config.js` は開発モードで読み込みを試み、無ければ `Error loading local config:` がコンソールに出るだけで続行する(`src/js/app/config/config.js`)。どちらも gitignore 対象で、作成しなくてよい。API キーなどの秘密情報を設定した場合は報告に含めない。

### 2.3 セーブデータの安全性

このアプリは次の場所にデータを書き込む。

- `electron-store`(ユーザーデータ領域の設定ファイル)
- IndexedDB(Electron のユーザーデータ領域)
- QuestIDE 用の作業ディレクトリ `userData/QuestIDE`(`src/js/app/common/code_runner.js`)
- セーブファイル(`config.js` の `saveFilePath`)

推奨: 既存の進行状況を守りたい場合は、別の OS アカウントまたは VM で確認する。同じアカウントで確認する場合は、既存のセーブデータが読み込まれ、更新される可能性があることを了承した上で進める。

禁止: 設定画面の「Clear data」(`ClearDataButton.jsx`、確認ダイアログが2回出て全進行状況を削除する)は、利用者が明示的に同意した場合を除き押さない。

## 3. 確認項目チェックリスト

各項目の結果欄に ○(期待通り) / △(動くが問題あり) / ×(動かない) / -(未実施) とメモを記入する。画面の文言や座標は版によって異なるため、期待結果は大まかな挙動で書いている。

| # | マイルストーン | 手順 | 期待結果 | 結果 | メモ |
|---|---|---|---|---|---|
| 1 | 起動・ウィンドウ表示 | `npm start` を実行する | ビルド完了後に「TerminalQuest」ウィンドウ(既定 1280x800、最小 1024x576)が開き、白画面やクラッシュなしで初期表示される | | |
| 2 | 初期画面(fog_owl)と移動 | 起動直後の画面を確認し、移動操作を行う | 開始レベルは `fog_owl`(`config.js` の `defaultLevelName`)。キャラクターが操作でき、HUD が表示される | | |
| 3 | 会話 | NPC に話しかける | 会話ウィンドウが開き、送りと終了ができる | | |
| 4 | ハック画面(validator)と QuestIDE 実行 | ハックできる対象で QuestIDE を開き、コードを実行する | ハック画面が開き、コードが実行され、検証結果が表示される。`ValidationHelper.js` の `String.replaceAll` ポリフィルに関わる処理も含む | | |
| 5 | 設定画面 | 設定を開き、拡張機能ディレクトリの「Choose Directory」を押す。Clear data は押さない | 設定画面が開き、ディレクトリ選択ダイアログ(`remote.dialog.showOpenDialog`)が表示され、選択が反映される | | |
| 6 | 終了・ダイアログ | ウィンドウを閉じる | ウィンドウが閉じ、プロセスも終了する(`main.js` は closed 時に `process.exit(0)`)。`npm start` 側のターミナルが戻る | | |
| 7 | 音楽・効果音 | 起動後と操作中に音を確認する | 音楽が再生され、操作時に効果音が鳴る | | |

補足: 各項目で DevTools(開き方は環境による。右クリックメニューなど)の Console にエラーが出ていないかも確認する。出た場合は全文を報告に貼る。

## 4. 報告テンプレート

次をコピーして埋め、そのまま返信に貼る。

````markdown
### 環境
- OS / バージョン:
- CPU(Apple Silicon / Intel など):
- `node -v`:
- `npm -v`:
- `python3 --version`:
- アプリ内または DevTools で確認した Electron バージョン(`process.versions.electron`):
- リポジトリのコミット(`git rev-parse --short HEAD`):
- 既存セーブデータ: あり / なし(別アカウント・VM を使用した場合はその旨)

### インストール・起動
- `npm install`: 成功 / 失敗(失敗時は出力全文)
- `npm start`: 成功 / 失敗

### マイルストーン結果
| # | 項目 | 結果(○/△/×/-) | メモ |
|---|---|---|---|
| 1 | 起動・ウィンドウ表示 | | |
| 2 | 初期画面と移動 | | |
| 3 | 会話 | | |
| 4 | ハック画面・QuestIDE | | |
| 5 | 設定画面 | | |
| 6 | 終了・ダイアログ | | |
| 7 | 音楽・効果音 | | |

### エラー出力
(ターミナルと DevTools Console のエラー文をそのままコピーして貼る)

### その他気づいたこと
````

報告に含めないもの: API キー、トークン、パスワード、`.env` の内容、セーブファイル、ユーザー固有の ID(GUID など)、ホームディレクトリ名を含む絶対パス(必要なら `~` に置き換える)。

## 5. 既知の状態

### 5.1 未確認の潜在リスク(unconfirmed)

リポジトリの既存ドキュメントとソースに書かれた内容だけを根拠にした候補である。実際に問題になるかは未確認で、確認済み不具合ではない。

| ID | 内容 | 根拠 | 状態 |
|---|---|---|---|
| R1 | Python 3.11 ではビルドに問題が出ることがある | `README.md` 16 行目 | unconfirmed |
| R2 | 旧 Electron に `String.prototype.replaceAll` が無いため、QuestIDE ユーザーコード実行にポリフィルが埋め込まれている。ポリフィルの挙動差が検証結果に影響する可能性がある | `src/js/app/components/hack_interface/validator/ValidationHelper.js` 322-323 行目 | unconfirmed |
| R4 | node-sass 8.0.0 の prebuilt バイナリが arm64 で不正と判定され、node-gyp 再ビルドに依存した | `docs/baseline/build-and-test.md` | unconfirmed(特定環境での診断結果) |
| R5 | 開発モードで React DevTools の自動インストールを試みる | `main.js` 16-26 行目 | unconfirmed(失敗してもログ出力のみで続行する実装) |
| R6 | 開発モードで `local_config.js` が無いと `Error loading local config:` がログに出る | `src/js/app/config/config.js` 32-40 行目 | unconfirmed(ログ出力のみで続行する実装) |

### 5.2 確認済み不具合

人間が実際に再現して報告したものだけをここに記録する。現時点で記録はない。

| ID | マイルストーン # | 現象 | 再現手順 | エラー文 | 報告日 |
|---|---|---|---|---|---|
| | | | | | |

### 5.3 デグレ判定基準

Tauri 版を現行の Electron 版と比較する際は、次の基準で判定する。

- 第3章の各マイルストーンについて、Electron 版で ○ と報告されたものは、Tauri 版でも同じマイルストーンに到達できること。
- Electron 版で × または △ と報告されたもの(第5.2節に記録されたもの)は、Tauri 版で同じ状態でもデグレとは扱わない。ただし新たな悪化がないかは確認する。
- Electron 版のベースラインに無い新しいエラー(DevTools Console 相当およびターミナル出力)が Tauri 版で出ていないこと。
- 確認済み不具合として扱うのは、人間が再現して報告したものだけである。第5.1節の unconfirmed 項目は、再現が報告されるまで不具合とみなさない。
- 手動確認の範囲外(第3章に無い機能)は、ベースラインが無いためデグレ判定の対象外とする。必要なら先にマイルストーンを追加する。
