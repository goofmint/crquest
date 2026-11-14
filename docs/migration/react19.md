# React 19 とレンダラー UI ライブラリの更新 (Phase 8: #46-#50)

Electron 11 (Chromium 87) のまま、レンダラーの React を 16.8 から 19 に上げ、周辺ライブラリを更新した。アプリは起動して確認していない (ビルドと Jest のみ)。

## 変更点

### #47 legacy API の除去
`src/js` を grep した結果、string ref、legacy context (`contextTypes` / `getChildContext`)、`componentWill*` 系、`findDOMNode`、関数コンポーネントの `defaultProps` は無かった。実際に React 19 で壊れる箇所は次の 2 種類。
- `react-transition-group` の `Transition` (4.4.x) は内部で `findDOMNode` を使い、React 19 では実行時に例外になる。`FogOwlFlying`、`TqWindowChome` (外側と内側)、`DevFundamentalsElevator` (同)、`NavMap` (3 箇所)、`nav_map/Canvas` のすべての `Transition` に `nodeRef` を渡し、同じ ref を子の DOM 要素に付けた。
- React 19 はコールバック ref の戻り値をクリーンアップ関数として扱う。`OnboardingInterface` (2 箇所) と `NameStep` の `ref={node => (this.x = node)}` を、値を返さないブロック本体に変えた。

残したもの: クラスコンポーネントの `static defaultProps` と `static contextType` (React 19 でも有効)。`propTypes` は React 19 で検証されなくなる (エラーも出ない)。`prop-types` の依存と宣言は、動作に影響しないので触っていない。

### #46 createRoot と React 19
- `src/js/index.jsx`: `ReactDOM.render` を `createRoot(appNode).render(<App />)` (`react-dom/client`) に変更。
- `public/package.json`: `react` / `react-dom` を `^19.1.0` に。`public/package-lock.json` は `npm install` で再生成した (lockfileVersion 1 から 3)。
- Vite: JSX を automatic ランタイムに (`react/jsx-runtime` は他の裸の import と同様、実行時に `public/node_modules` から解決)。React 19 の production ビルドには `jsxDEV` が無いため、`vite.config.mjs` で `NODE_ENV=production` に固定し、`jsx-dev-runtime` が出力されないようにした。
- Jest 用の `.babelrc` は classic ランタイムのまま (インストール済みの `@babel/preset-react` 7.8.3 は automatic に未対応。テストのファイルはすべて `import React` している)。
- `public/package.json` の `overrides` で `react-splitter-layout` の peer (`react ^15 || ^16`) を `$react` に上書きしている (下記 #50)。

### テスト基盤 (Jest 26 のまま)
- Enzyme (`enzyme`, `enzyme-adapter-react-16`) は React 19 では動かないため削除し、`@testing-library/react` 16 / `@testing-library/dom` 10 / `@testing-library/jest-dom` 6 に置き換えた。テストの意図と検証内容は維持している (Button, ClearDataButton, Settings の 3 つ)。shallow の `.instance()` は `ref` で、`wrapper.update()` は `act` で置き換えた。
- Jest のランナーは `@jest-runner/electron` で、テストは Electron 11 の実ブラウザ (Chromium 87) 内で動く。jsdom は使っていないため、RTL 16 と Jest 26 はそのまま動く。Vitest へは移行していない (Phase 9, #54-57)。
- Jest のフェイクタイマーは Electron 環境では使えない (`fakeTimers are not supproted in electron environment`)。タイマーを使うテストは `window.setTimeout` を差し替えるか実時間で待っている。
- `jest.config.js` の `moduleNameMapper` で `react` / `react-dom` を `public/node_modules` に固定した。RTL (ルートの devDependency) が peer としてルートの `node_modules` に別の React を入れるため、固定しないとアプリ・styled-components・RTL が別々の React を見てしまう。
- `vendoredJavaScript.test.js` / `vendoredApiAcademy.test.js` は lockfile v1 の `dependencies` を見ていたため、v3 の `packages["node_modules/<name>"]` を見るように変更した。
- 追加したテスト: `react19Compat.test.js` (Transition の `nodeRef` と、コールバック ref を使う `NameStep`)、`styledComponents.test.js`、`ItemPopover.test.js`、`SplitterLayout.test.js`。

### #48 styled-components 5 から 6
使用箇所は `menu/Journal.jsx` の 2 つのコンポーネントだけ (デフォルト import、`styled.div` のタグ付きテンプレート、props / attrs / theme / `as` は未使用)。ソースの変更は不要で、`^6.6.0` に上げた。

### #49 react-tiny-popover 3 から 8
使用箇所は `ItemPopover.jsx` だけ。
- `import Popover from` を `import { Popover } from` に変更。
- `position="bottom"` を `positions={['bottom', 'top', 'right', 'left']}` に変更 (v3 は指定位置の次に残りを top, right, left の順で試した)。
- `transitionDuration` は v8 に無いので削除 (v3 では 0.01 秒でほぼ無効だった)。
- v8 で既定値が変わった値を明示: `padding={6}` (v3 の既定 6、v8 の既定 0)、`boundaryInset={6}` (v3 の `windowBorderPadding`、既定 6)、`containerStyle={{ overflow: 'hidden' }}` (v3 は hidden、v8 は visible。浮動 (float) するアバターを内包するために必要)。
- `content` と、ホバー用のハンドラを持つ子の `<div>` はそのまま (v8 は子に `ref` を付ける。DOM 要素なので問題ない)。

### #50 react-splitter-layout
結論: 3.0.1 を維持し、置き換えない。
- 最新は 4.0.0 (2019 年) で、peer は同じく `react ^15 || ^16`。4.0.0 は CSS を別ファイル (`lib/index.css`) にしており、このビルド (外部 `require`) では CSS を読み込めないため、3.0.1 (CSS を JS に内蔵) より不利。
- 3.0.1 の `lib/index.js` を読み、React 19 で壊れる API を使っていないことを確認した。クラスコンポーネントと戻り値のないコールバック ref のみ。`findDOMNode` なし。`Pane` は関数コンポーネントで `defaultProps` を持つが、`SplitterLayout` が全 props を明示的に渡すため影響しない。`propTypes` は無視される。
- 実ブラウザで、QuestIDE と同じ props でのレンダリング、初期サイズ 30%、ドラッグによるリサイズ、コールバックをテストした (`SplitterLayout.test.js`)。
- 残る問題は peer の宣言だけなので、`public/package.json` の `overrides` で `react` を `$react` に固定した。将来メンテされなくなった場合の代替候補は `react-resizable-panels` (React 19 対応)。ただし今回は動作が同じため置き換えていない。

## 手動で確認してほしいこと (アプリ起動はしていない)
すべて React 19 を Electron 11 (Chromium 87) で動かす点が最大の未確認事項。起動直後に白画面にならないこと、DevTools に例外が出ないことを最初に見る。

- 起動とタイトル、オンボーディング (名前入力の自動フォーカス、ステップ移動、自動スクロール)
- ナビゲーションマップ (NavMap): 開くときのフェード、惑星の選択、Canvas の線の伸び、右の説明パネルと下のボタンバーの出入り、閉じるときのアニメーション (`onExited` で閉じる)
- Elevator と TqWindowChrome (フロア選択画面ほか): 表示、フェードアウト、閉じるボタン、フロア選択時の黒フェード
- FogOwlFlying: 表示と、約 5 秒後のフェードアウトで自動で閉じること
- インベントリのポップオーバー (ItemPopover): アイテム、キャラクターの装備スロット、目標画面の報酬アイコンに 0.5 秒ホバーして表示。位置 (下、足りなければ上や横)、画面端での押し戻し、余白 (6px)、浮動アバターを含んだ高さ、枠と影、マウスを離すと消えること、ドラッグ中の挙動
- QuestIDE のスプリッター: 縦分割の初期比率 (30%)、ドラッグでのリサイズ、リサイズでエディタの再描画 (`editor.resize()`)
- ジャーナル (Journal): styled-components の枠、見出しの位置と色
- 設定画面のバージョン表示と「Erase Game Data」ボタン

## 既知のリスク
- React 19 の CJS ビルドは Chromium 87 向けに構文を確認しただけ (`Object.hasOwn` などの新しい API は検出されなかった)。実機での確認が必要。
- ルートの `package.json` に `@testing-library/*` を追加し Enzyme を削除したが、ルートの `package-lock.json` は既知のドリフトがあるためコミットしていない。マージ前に `npm install` でロックを更新すること。
- ItemPopover の境界は v3 がウィンドウ全体、v8 は `document.body` を基準にする。body がウィンドウと同じ大きさでない場合、端での押し戻しの位置が変わる可能性がある。
