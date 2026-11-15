# Tauri のシェル動作: DevTools、終了確認、外部リンク (#64)

Electron は変更していない。`npm run build:all` の `public/index.js` / `index.html` / `index.css` は変更前と SHA-256 が一致する (確認済み)。

## 実装

| 項目 | 実装 | 場所 |
| --- | --- | --- |
| DevTools | Rust の `open_devtools` / `toggle_devtools` (debug ビルドのみ)。release ビルドは `Err("DevTools are not available in release builds")` で明示的に拒否する。JS 側 (`platform/tauri/devtools.js`) は `Promise<void>` を返し、失敗は `Error` で reject する。Tauri のビルドでは F12 / `Ctrl+Shift+I` / `Cmd+Option+I` で toggle し、拒否はダイアログに表示する。Konami コード (`App.jsx`) は変更していない (await しないので、拒否は未処理の Promise 拒否としてコンソールに出る) | `src-tauri/src/lib.rs`、`src/js/tauriShell.js` |
| 終了確認 | Rust の `WindowEvent::CloseRequested`。`prevent_close()` の後に dialog plugin の Rust API で OK / Cancel を出し、OK のときだけ `window.destroy()` する。確認中の再要求は無視する (`CloseConfirmation`) | `src-tauri/src/close.rs` |
| 外部リンク | クリックされた `a[href^="http"]` (`index.jsx` と同じ判定、URL の組み立ても同じ) を `platform/shell.openExternal` (plugin-opener) で開く。失敗はログとダイアログで表示する。http(s) 以外は capability の scope (`opener:allow-open-url`: `https://*`、`http://*`) が拒否する | `src/js/tauriShell.js` |
| 起動 | Tauri ビルド (`vite build --mode tauri`) だけ、入口を `src/js/tauriIndex.jsx` にした。`await initPlatform()` → リンク / DevTools の登録 → `import('./index.jsx')` の順 | `vite.config.mjs`、`src/js/tauriIndex.jsx` |

### 判断事項

- 終了確認は JS の `onCloseRequested` ではなく Rust にした。フロントの起動 (`index.jsx` は未対応) に依存せず、capability の追加 (`core:window:allow-destroy` や dialog) が不要。権限の変更は無い。
- Electron (`main.js`) には終了確認が無い。したがって Electron の動作は変えず、Tauri だけに issue の要求どおり追加した。
- ダイアログは `kind: Info` (Tauri に question 種別が無い。`platform/dialog` と同じ)。
- `index.jsx` が自前のリンクハンドラを持つため、`tauriShell.js` の重複は意図的である (`index.jsx` を変えると Electron の bundle が変わるため)。`index.jsx` を Tauri 対応にするとき (下記) は `tauriShell.js` 側のリンクハンドラを外すこと。二重に開く。
- DevTools のショートカットは release でも登録し、拒否を表示する (黙って何もしない動作を避ける)。

## 範囲外 (後続)

`index.jsx` は `require('electron')` (`remote`、`Menu`) を使うため、Tauri のビルドではまだ起動しない。`tauriIndex.jsx` は `import('./index.jsx')` の失敗をコンソールに出して再 throw する。リンクと DevTools のショートカットは、その前に登録するため単独で動く。次の呼び出しは `tauri-platform.md` 3.2 章の表のとおり未移行である。

- `index.jsx`: `remote` / `Menu` (Help メニュー)、`remote.Menu` の代替。
- store: `ContextProvider.jsx` (getValue)、`common/context/index.js` (setValue)、`common/audio/index.js`、`ClearDataButton.jsx` (hasValue / deleteValue)。
- fs: `Game.jsx` の `list`、`ClearDataButton.jsx` の `remove`、`context_provider/system.js` の `readFileSync`。
- `ValidationHelper.isExecutableValid` の `pathExistsSync`。
- `config.js` ほか、モジュール読み込み時の `paths` / `env` (`initPlatform()` 後の import は `tauriIndex.jsx` で対応済み)。

## 手元で確認すること (利用者が実行する)

エージェントはアプリを起動していない。検証したのは `cargo check` / `clippy` / `fmt` / `test`、`npm ci`、`npm run build:all`、`npm test`、`vite build --mode tauri` の出力のみ。

1. 前提: `npm ci`。
2. DevTools (dev): `npm run tauri -- dev`。ウィンドウ (空白でよい) で F12 または `Cmd+Option+I` (`Ctrl+Shift+I`) を押すと DevTools が開き、もう一度押すと閉じる。
3. 終了確認: ウィンドウの閉じるボタンを押す。確認ダイアログ (「Are you sure you want to quit TerminalQuest?」、OK / Cancel) が出る。Cancel でアプリが開いたまま。もう一度閉じて OK でアプリが終了する。ダイアログ表示中にさらに閉じるボタンを押しても二つ目は出ない。
4. 外部リンク: DevTools のコンソールで次を実行し、そのリンクをクリックする。既定のブラウザで `https://example.com/?a=1` が開くこと。
   ```js
   document.body.insertAdjacentHTML('beforeend', '<a style="position:fixed;top:0;left:0;color:#fff;z-index:9" href="https://example.com/?a=1">link</a>');
   ```
5. release が DevTools を拒否する: `npm run tauri -- build` (またはリリースビルド) したアプリで F12 を押す。DevTools は開かず、「Toggling Developer Tools failed: DevTools are not available in release builds」のダイアログが出る。(release では WebView の右クリック Inspect も出ない。)
6. Electron: `npm start` が従来どおり動く。
