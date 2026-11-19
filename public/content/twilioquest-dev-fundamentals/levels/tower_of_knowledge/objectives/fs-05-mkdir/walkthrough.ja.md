# ディレクトリの作成

`cd` と同様に、`mkdir` ではディレクトリ名だけを渡せます。`mkdir my_cool_directory` を実行すると、現在の作業ディレクトリの中に `my_cool_directory` が作成されます。つまり `my_cool_directory` の親は、現在の作業ディレクトリです。

パスを指定すれば、別のディレクトリの中に作ったり、複数を一度に作ったりできます。`mkdir <%= `${formatPathPartsForOs('my_cool_directory', 'my_cooler_directory')}`%>` は `my_cool_directory` の中にディレクトリを作成するので、あらかじめ `cd` でそこへ移動する必要はありません。Linux や macOS のシェルでは、`mkdir <%= `${formatPathPartsForOs('directory1', 'directory2')}`%>` を実行するときに `directory1` が存在しないと、エラーになります。`-p` フラグを付けると、必要なディレクトリをまとめて作成できます。`mkdir -p <%= `${formatPathPartsForOs('directory1', 'directory2')}`%>` は `directory1` がなくても両方のディレクトリを作成します。

Windows PowerShell の mkdir では、中間ディレクトリを自動で作成できるため、このフラグは不要です。

`..` を使うと親ディレクトリに作成できます。`<%= `${formatPathPartsForOs('..', 'directory3')}`%>` は現在の作業ディレクトリの親をたどって、そこに `directory3` を作るためのパスです。

ここまでは作業ディレクトリからの相対パスを使ってきました。ルートからの絶対パスを使えば場所を直接指定できます。パスの先頭に `~` を置けば、ホームディレクトリからの場所も指定できます。
