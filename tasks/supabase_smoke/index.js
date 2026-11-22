#!/usr/bin/env node
// ローカル Supabase スタックのスモーク検証 (Auth と Edge Function)。
// 外部 OAuth の資格情報、.env、Firebase には接続しない。
// キー、トークン、status の出力はログに出さない。

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function fail(step, detail) {
  console.error(`[smoke] FAIL ${step}: ${detail}`);
  process.exit(1);
}

function ok(step) {
  console.log(`[smoke] ok   ${step}`);
}

function readStatus() {
  const result = spawnSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    // Windows の npx は npx.cmd のため shell 経由でのみ起動できる。引数は固定値。
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    fail('status', 'supabase status が失敗した。`npm run supabase:start` を実行したか確認する');
  }
  try {
    return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } catch (error) {
    return fail('status', 'supabase status の JSON を解析できない');
  }
}

async function request(step, url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const hint = step.startsWith('functions')
      ? ' `npm run supabase:functions` で関数を提供しているか確認する。'
      : '';
    return fail(step, `接続できない (${error.cause ? error.cause.code : error.message}).${hint}`);
  }
}

async function main() {
  const status = readStatus();
  const apiUrl = status.API_URL;
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
  if (!apiUrl || !key) {
    fail('status', 'API URL またはクライアント用キーを取得できない');
  }

  const health = await request('auth health', `${apiUrl}/auth/v1/health`, {
    headers: { apikey: key },
  });
  if (health.status !== 200) fail('auth health', `HTTP ${health.status}`);
  ok('auth health');

  const email = `smoke-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomBytes(16).toString('hex');
  const signup = await request('auth signup', `${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (signup.status !== 200) fail('auth signup', `HTTP ${signup.status}`);
  const body = await signup.json();
  if (!body.access_token) {
    fail('auth signup', 'access_token がない (enable_confirmations の設定を確認する)');
  }
  ok('auth signup');

  const fnUrl = `${apiUrl}/functions/v1/health`;
  const anon = await request('functions without token', fnUrl, {});
  if (anon.status !== 401) fail('functions without token', `HTTP ${anon.status} (期待値 401)`);
  ok('functions without token -> 401');

  const authed = await request('functions with token', fnUrl, {
    headers: { Authorization: `Bearer ${body.access_token}`, apikey: key },
  });
  if (authed.status !== 200) fail('functions with token', `HTTP ${authed.status} (期待値 200)`);
  const json = await authed.json();
  if (!json || json.ok !== true) fail('functions with token', '応答の内容が不正');
  ok('functions with token -> 200');

  console.log('[smoke] all checks passed');
}

main().catch(error => fail('unexpected', error.message));
