#!/usr/bin/env node
// ローカル Supabase スタックのスモーク検証 (Auth と Edge Function)。
// 外部 OAuth の資格情報、.env、Firebase には接続しない。
// キー、トークン、status の出力はログに出さない。

const crypto = require('crypto');

const { readLocalStatus } = require('../shared/supabaseLocal');

function fail(step, detail) {
  console.error(`[smoke] FAIL ${step}: ${detail}`);
  process.exit(1);
}

function ok(step) {
  console.log(`[smoke] ok   ${step}`);
}

function readStatus() {
  try {
    return readLocalStatus();
  } catch (error) {
    return fail('status', error.message);
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

async function signUp(apiUrl, key, step) {
  const response = await request(step, `${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `smoke-${crypto.randomUUID()}@example.test`,
      password: crypto.randomBytes(16).toString('hex'),
    }),
  });
  if (response.status !== 200) fail(step, `HTTP ${response.status}`);
  const json = await response.json();
  if (!json.access_token) fail(step, 'access_token がない');
  return json.access_token;
}

async function rpc(step, apiUrl, key, token, name, args) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await request(step, `${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  let json = null;
  try {
    json = await response.json();
  } catch (error) {
    json = null;
  }
  return { status: response.status, json };
}

function expectError(step, result, message) {
  const text = result.json && result.json.message;
  if (result.status < 400 || (message && text !== message)) {
    fail(step, `HTTP ${result.status} ${text || ''} (期待: ${message || 'エラー'})`);
  }
  ok(step);
}

// チーム・オペレーションの RPC を実 JWT で検証する (シードの合成グループを使う)。
async function checkGroups(apiUrl, key, tokenA) {
  const tokenB = await signUp(apiUrl, key, 'groups signup (2nd user)');
  const call = (step, token, name, args) => rpc(step, apiUrl, key, token, name, args);
  const teamCode = 'SMOKETEAM1';

  const noToken = await call('groups rpc without token', null, 'list_my_groups', {});
  if (noToken.status !== 401 && noToken.status !== 403) {
    fail('groups rpc without token', `HTTP ${noToken.status} (期待値 401/403)`);
  }
  ok('groups rpc without token -> denied');

  const joined = await call('join_group', tokenA, 'join_group', { p_kind: 'team', p_join_code: ` ${teamCode.toLowerCase()} ` });
  if (joined.status !== 200 || !Array.isArray(joined.json) || joined.json.length !== 1) {
    fail('join_group', `HTTP ${joined.status}`);
  }
  const groupId = joined.json[0].group_id;
  ok('join_group (valid code)');

  expectError('join_group invalid code', await call('join_group invalid code', tokenA, 'join_group', { p_kind: 'team', p_join_code: 'NOSUCH123' }), 'invalid_join_code');
  expectError('join_group duplicate', await call('join_group duplicate', tokenA, 'join_group', { p_kind: 'team', p_join_code: teamCode }), 'already_member');

  const list = await call('list_my_groups', tokenA, 'list_my_groups', {});
  if (list.status !== 200 || list.json.length !== 1 || list.json[0].group_id !== groupId) {
    fail('list_my_groups', `HTTP ${list.status}`);
  }
  ok('list_my_groups');

  expectError('leave_group by another user', await call('leave_group by another user', tokenB, 'leave_group', { p_group_id: groupId }), 'not_member');
  expectError('get_group_contribution by non-member', await call('get_group_contribution by non-member', tokenB, 'get_group_contribution', { p_group_id: groupId }), 'not_member');

  const mine = await call('get_group_contribution', tokenA, 'get_group_contribution', { p_group_id: groupId });
  if (mine.status !== 200 || Number(mine.json[0].total_points) !== 0) {
    fail('get_group_contribution', `HTTP ${mine.status}`);
  }
  ok('get_group_contribution (member)');

  const left = await call('leave_group', tokenA, 'leave_group', { p_group_id: groupId });
  if (left.status >= 400) fail('leave_group', `HTTP ${left.status}`);
  ok('leave_group (self)');

  const direct = await request('groups direct table access', `${apiUrl}/rest/v1/groups?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${tokenA}` },
  });
  if (direct.status < 400) fail('groups direct table access', `HTTP ${direct.status} (期待: 拒否)`);
  ok('groups direct table access -> denied');
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

  await checkGroups(apiUrl, key, body.access_token);

  console.log('[smoke] all checks passed');
}

main().catch(error => fail('unexpected', error.message));
