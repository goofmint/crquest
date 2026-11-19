# Twilio アカウントの設定

この課題では、[Twilio アカウントを作成](https://www.twilio.com/try-twilio?utm_source=twilioquest-3) し、Twilio を使うために必要な認証情報を見つけます。認証情報は TwilioQuest が手元のコンピューターに保存し、Twilio 関連のプログラミング課題の検証や、進行を円滑にするために使います。

## アカウントの認証情報を確認する

[Twilio アカウントに登録](https://www.twilio.com/try-twilio?utm_source=twilioquest-3) したら、[Console のホーム画面](https://www.twilio.com/console) で認証情報を確認できます。

<center>
<img src="images/basic_training/account-sid-auth-token.png" alt="Twilio Console のホーム画面。ACCOUNT SID 欄に識別子が表示され、その下の AUTH TOKEN 欄は view で表示できます。" />
</center>

それぞれの値が、どのようなものか見てみましょう。

- **Twilio Account SID** は、Twilio アカウントを一意に識別する値です。アカウントには [電話番号](https://www.twilio.com/console/phone-numbers/incoming)、[発信者番号](https://www.twilio.com/console/phone-numbers/verified)、[メッセージングサービス](https://www.twilio.com/console/sms/services) など、Twilio API に関するリソースが紐づきます。
- **Twilio Auth Token** は、Twilio アカウントに API でアクセスする際のパスワードです。[バージョン管理システム](https://en.wikipedia.org/wiki/Version_control) に誤ってコミットしないよう注意してください。

この 2 つの値をユーザー名とパスワードとして使い、[Twilio REST API](https://www.twilio.com/docs) にアクセスします。

## アカウントのセキュリティ

本番アプリで使っている Twilio アカウントの認証情報を、TwilioQuest で使うことはお勧めしません。検証や自動処理が及ぼす影響は最小限に抑えるよう設計していますが、本番環境の認証情報へのアクセスを許可すると、予期しない結果が起きる場合があります。TwilioQuest 専用の [新規プロジェクトを作る](https://www.twilio.com/console/projects/create) ことを検討してください。

検証が成功したあと、TwilioQuest に渡した認証情報は **設定** メニューからいつでも編集または削除できます。探索中は、*O* キーを押すか、画面上部の HUD の **設定** アイコンをクリックして開きます。

## 障害を突破する
右側の入力欄に Twilio アカウントの Account SID と Auth Token をそのまま入力し、*HACK* を押してください。この検証では形式のみを確認します。認証情報は Twilio に送信されず、形式が正しければ課題クリアです。
