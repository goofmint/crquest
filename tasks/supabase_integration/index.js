#!/usr/bin/env node
// ローカル Supabase スタックでの統合テストを順に実行する (#193)。
//   npm run supabase:integration [-- --skip-reset]
// 手順 (1 つでも失敗したら止める):
//   0. check:firebase (Firebase への参照が戻っていないこと)
//   1. supabase db reset          (マイグレーションと seed から作り直す)
//   2. supabase test db           (pgTAP: RLS、分離、冪等、同時実行、公開データの絞り込み)
//   3. sync:missions --target local (カタログと検証定義を発行する。スモークの認定検証が使う)
//   4. supabase:smoke             (実 JWT の HTTP スモーク)
//   5. supabase:catalog-check     (カタログの公開と権限)
//   6. cargo test -- --ignored    (Rust の統合テスト: 認証、クラウドセーブ、解除コード・植樹、チーム)
// 接続先はループバックのローカルスタックだけ。`supabase status` の API URL がループバックでなければ中止する。
// reset はローカルの DB を消す。リモートの DB は使わない (--linked / --db-url は渡さない)。
// キー、トークン、status の出力はログに出さない。

const path = require('path');
const { spawnSync } = require('child_process');

const { readLocalStatus, isLoopbackUrl } = require('../shared/supabaseLocal');

const repoRoot = path.resolve(__dirname, '..', '..');
const RUST_TESTS = [
  'auth_local_supabase',
  'cloud_save_local_supabase',
  'unlocks_trees_local_supabase',
  'groups_local_supabase',
];

function abort(message) {
  console.error(`[integration] ABORT ${message}`);
  process.exit(1);
}

function run(step, command, args, { cwd = repoRoot, env = process.env } = {}) {
  console.log(`[integration] ---- ${step}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`[integration] FAIL ${step} (exit ${result.status})`);
    process.exit(1);
  }
  console.log(`[integration] ok   ${step}`);
}

function main() {
  const skipReset = process.argv.includes('--skip-reset');

  let status;
  try {
    status = readLocalStatus();
  } catch (error) {
    return abort(error.message);
  }
  const url = status.API_URL;
  const publishable = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!url || !publishable || !secret) abort('API URL またはキーを `supabase status` から取得できない');
  if (!isLoopbackUrl(url)) abort('API URL がループバックではない。ローカルスタック以外には接続しない');

  run('check:firebase', 'node', ['tasks/check_firebase.js']);
  if (!skipReset) run('supabase db reset', 'npx', ['supabase', 'db', 'reset']);
  run('pgTAP (supabase test db)', 'npx', ['supabase', 'test', 'db']);
  run('sync:missions --target local', 'node', ['tasks/sync_missions/supabase.js', '--target', 'local']);
  run('supabase:smoke', 'node', ['tasks/supabase_smoke/index.js']);
  run('supabase:catalog-check', 'node', ['tasks/supabase_catalog_check/index.js']);

  // Rust 側のテストには環境変数でだけ渡す (引数やログに出さない)。
  const env = {
    ...process.env,
    TERMINALQUEST_TEST_SUPABASE_URL: url,
    TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY: publishable,
    TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY: secret,
  };
  for (const name of RUST_TESTS) {
    run(`cargo test --test ${name} -- --ignored`, 'cargo', ['test', '--test', name, '--', '--ignored'], {
      cwd: path.join(repoRoot, 'src-tauri'),
      env,
    });
  }

  console.log('[integration] all steps passed');
}

main();
