# Git リポジトリを作成する

Git の公式サイトに、[コンピューター上の既存フォルダーにリポジトリを作成する手順](https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository#_initializing_a_repository_in_an_existing_directory)があります。

サンプルのプロジェクト名の代わりに、あなたの JavaScript 作業用フォルダーにリポジトリを作ります。場所は `<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>` です。

## 実行するコマンド

1. `cd "<%= env.TQ_JAVASCRIPT_WORKSPACE_PATH.value %>"`
2. `git init`
3. `git add -A`
4. `git commit -m "Initial commit"`
