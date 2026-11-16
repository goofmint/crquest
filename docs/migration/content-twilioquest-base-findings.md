# twilioquest-base 上流ロジックへの CodeRabbit 指摘 4 件の調査 (#108)

`npm pack twilioquest-base@8.1.0` (空のディレクトリに展開、スクリプトは実行していない) の 4 ファイルと、取り込み済みのコピーを比較した。

## 結論

| # | ファイル | 上流由来 | 実害 | 再現テスト | 判断 |
| --- | --- | --- | --- | --- | --- |
| 1 | `flatten-array/validator.js` | 確認済み (比較ロジックは同一) | 学習者: 配列を返さず `.join()` した文字列でも合格する (説明文は「新しい配列を返す」) | `baseValidators.test.js` | 修正済み |
| 2 | `remove-duplicate-characters/validator.js` | 確認済み (テストケースは同一の 2 件) | 学習者: 連続 3 文字以上を縮約しない解答 (`s.replace(/(.)\1/g, '$1')`) が合格する。説明文に `aaaaaaaaaaaaaaabc` -> `abc` の例がある | 同上 | 修正済み |
| 3 | `fog_owl/events.js` | 確認済み (ファイルは同一) | 小。保存済みの状態は、チュートリアル終了後の次のイベントまで `hasSeenTutorial` を含まない | 調査用スクリプトで再現 (コミットなし) | 未修正 (選択肢を報告) |
| 4 | `fog_owl/events/handleTutorial.js` | 確認済み (ファイルは同一) | 中。初回の fog_owl 入場で、チュートリアルが 2 回走る | 同上 | 未修正 (選択肢を報告) |

## 1, 2 (修正済み)

1: 期待値が配列でも `String(結果) === String(期待値)` の比較 (小文字化) で合格していた。`!Array.isArray(expected)` を条件に加えた。空配列の期待値 (`"Pure Ducktypium!"`、大文字小文字を区別しない) の挙動は変えていない。変わるのは、期待値が配列のケースで文字列が返されたときだけ (不合格、メッセージは `Expected [1,two,3,four] from input [...], but received "1,two,3,four".`)。既存のテスト「joined string -> 合格」は、この指摘のとおり不合格に変更した。

2: 説明文の例 `aaaaaaaaaaaaaaabc` -> `abc` を追加した。他のケースと既存の正解は変わらない。

どちらも、修正前に追加したテストが失敗することを確認した後で修正した。

## 3, 4 (未修正)

ゲーム側 (`Game.jsx` の `completionHandler`) は、新しいレベルに入るとき `levelDidLoad` と `mapDidLoad` を続けて発行する。`events.js` は毎回 `handleTutorial` を await せずに呼ぶ。実際のイベント列と同じ偽の `world` で再現した結果 (`world.setState` の引数を、ディスクに保存される値として記録):

- 通知が 6 回 (1 回の実行で 3 回)、analytics が 2 回: チュートリアルが 2 回走る (#4)。2 つの実行は同じ `worldState` オブジェクトを共有する。
- 保存された値は `{}` と `{}` のみ。メモリ上は `hasSeenTutorial: true` だが、ディスクへ保存されるのは次の fog_owl のイベント (`playerDidInteract` や `levelWillUnload`) の `setState` 時 (#3)。この間にアプリを終了すると、次回起動でチュートリアルが再度走る。

修正の案 (ゲームの挙動 (表示のタイミング、保存される状態のキー) に関わるため、判断を仰ぐ):

- #3: `handleTutorial` の末尾で `world.setState(STATE_KEY, worldState)` を呼ぶ (`config` の `STATE_KEY` を使う)。保存のタイミングが早まるだけで、状態のキーは増えない。
- #4: 進行中の印を同期的に設定する。置き場所の選択肢は (a) `worldState` に新しいキー (保存される状態が増え、途中で終了すると残る恐れがある)、(b) モジュール内の変数 (保存されないが、レベルの再読み込みを跨ぐ寿命の判断が要る)。plan の `inProgress` を `worldState` に置く案は (a) で、中断時に印が残る場合の解除を別途設計する必要がある。
