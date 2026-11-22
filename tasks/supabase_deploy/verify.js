#!/usr/bin/env node
// デプロイ後の非破壊確認 (#194)。読み取り専用の GET / list RPC だけを送る。
//   npm run deploy:supabase:verify
// 入力: TERMINALQUEST_SUPABASE_URL, TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PROJECT_REF
//       (任意) TERMINALQUEST_REMOTE_CHECK_ACCESS_TOKEN: あればベアラー付きの health も確認する
// サインアップや書き込み、公開系の操作はしない。キーはログに出さない。

const { REF_PATTERN } = require('./index');

class VerifyError extends Error {}

function resolveTarget(env) {
  const url = env.TERMINALQUEST_SUPABASE_URL;
  const key = env.TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY;
  const ref = env.SUPABASE_PROJECT_REF;
  const missing = [
    ['TERMINALQUEST_SUPABASE_URL', url],
    ['TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY', key],
    ['SUPABASE_PROJECT_REF', ref],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) throw new VerifyError(`環境変数が未設定: ${missing.join(', ')}`);
  if (!REF_PATTERN.test(ref)) throw new VerifyError('SUPABASE_PROJECT_REF は英小文字 20 文字であること');
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new VerifyError('TERMINALQUEST_SUPABASE_URL を解析できない');
  }
  if (parsed.protocol !== 'https:') throw new VerifyError('TERMINALQUEST_SUPABASE_URL は https のみ');
  if (parsed.hostname !== `${ref}.supabase.co`) {
    throw new VerifyError(`TERMINALQUEST_SUPABASE_URL のホストが <SUPABASE_PROJECT_REF>.supabase.co と一致しない`);
  }
  return { base: parsed.origin, key, token: env.TERMINALQUEST_REMOTE_CHECK_ACCESS_TOKEN };
}

async function verify(env = process.env, { fetch: fetchImpl = fetch, log = console.log } = {}) {
  const { base, key, token } = resolveTarget(env);
  const headers = { apikey: key };
  const checks = [
    { name: 'auth health', path: '/auth/v1/health', expect: 200 },
    // ゲートウェイの JWT 検証が効いていること (トークンなしは拒否される)
    { name: 'health (JWT なしは拒否)', path: '/functions/v1/health', expect: 401, headers: {} },
    {
      name: 'missions (公開カタログ)',
      path: '/rest/v1/missions?select=id&limit=1',
      expect: 200,
      note: body => (Array.isArray(body) && body.length === 0 ? 'カタログ未公開 (空)' : ''),
    },
    {
      name: 'list_live_events',
      path: '/rest/v1/rpc/list_live_events',
      method: 'POST',
      body: '{}',
      expect: 200,
    },
  ];
  if (token) {
    checks.push({
      name: 'health (ベアラー付き)',
      path: '/functions/v1/health',
      expect: 200,
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      json: body => body && body.ok === true,
    });
  }
  let failed = 0;
  for (const check of checks) {
    let status;
    let body;
    try {
      const response = await fetchImpl(`${base}${check.path}`, {
        method: check.method || 'GET',
        headers: {
          ...(check.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(check.headers ?? headers),
        },
        ...(check.body ? { body: check.body } : {}),
      });
      status = response.status;
      body = await response.json().catch(() => undefined);
    } catch (error) {
      status = 'ネットワークエラー';
    }
    const ok = status === check.expect && (!check.json || check.json(body));
    if (!ok) failed += 1;
    const note = ok && check.note ? ` (${check.note(body)})`.replace(' ()', '') : '';
    log(`[verify] ${ok ? 'ok  ' : 'FAIL'} ${check.name}: ${status} (期待 ${check.expect})${note}`);
  }
  if (failed > 0) throw new VerifyError(`${failed} 件の確認に失敗した`);
  log('[verify] すべて成功');
}

if (require.main === module) {
  require('dotenv').config({ quiet: true });
  verify().catch(error => {
    if (!(error instanceof VerifyError)) throw error;
    console.error(`[verify] ERROR ${error.message}`);
    process.exit(1);
  });
}

module.exports = { resolveTarget, verify, VerifyError };
