// ローカル Supabase スタックの接続情報を `supabase status` から取得する共有モジュール。
// キー、トークン、status の出力はログに出さない。

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

// 失敗時は Error を投げる (呼び出し側が終了処理を決める)。
function readLocalStatus() {
  const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    // Windows の npx は npx.cmd のため shell 経由でのみ起動できる。引数は固定値。
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      'supabase status が失敗した。`npm run supabase:start` を実行したか確認する'
    );
  }
  try {
    return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } catch (error) {
    throw new Error('supabase status の JSON を解析できない');
  }
}

function isLoopbackUrl(url) {
  try {
    return LOOPBACK_HOSTS.includes(new URL(url).hostname);
  } catch (error) {
    return false;
  }
}

module.exports = { readLocalStatus, isLoopbackUrl, LOOPBACK_HOSTS };
