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

// 認定 API を実 JWT で検証する。カタログと検証定義の発行 (npm run sync:missions -- --target local) が前提。
// sum-array の結果は、発行された入力からここ (クライアント側) で計算する。サーバーは提出コードを実行しない。
// 同時提出は Promise.all で送る。加点を得るのは常にちょうど 1 件であること。
async function checkCertification(apiUrl, key, tokenA, tokenB) {
  const call = (step, token, name, args) => rpc(step, apiUrl, key, token, name, args);
  const sum = inputs => inputs.map(list => list.reduce((a, b) => a + b, 0));
  const issue = async (step, token, mission, objective) => {
    const r = await call(step, token, 'issue_certification_challenge', { p_mission_id: mission, p_objective_id: objective });
    if (r.status !== 200 || !Array.isArray(r.json) || r.json.length !== 1) {
      const hint = r.json && r.json.message === 'objective_not_certifiable'
        ? ' (カタログと検証定義が未発行: npm run sync:missions -- --target local)' : '';
      fail(step, `HTTP ${r.status} ${(r.json && r.json.message) || ''}${hint}`);
    }
    if ('expected' in r.json[0]) fail(step, '発行の応答に expected が含まれている');
    return r.json[0];
  };
  const submit = (step, token, id, result) =>
    call(step, token, 'submit_certification_challenge', { p_challenge_id: id, p_result: result });
  const row = (step, r) => {
    if (r.status !== 200 || !Array.isArray(r.json) || r.json.length !== 1) fail(step, `HTTP ${r.status} ${(r.json && r.json.message) || ''}`);
    return r.json[0];
  };

  const noToken = await call('certification rpc without token', null, 'issue_certification_challenge', { p_mission_id: 'javascript', p_objective_id: 'array2D' });
  if (noToken.status !== 401 && noToken.status !== 403) fail('certification rpc without token', `HTTP ${noToken.status} (期待値 401/403)`);
  ok('certification rpc without token -> denied');

  const notCertifiable = await call('issue (no definition)', tokenA, 'issue_certification_challenge', { p_mission_id: 'javascript', p_objective_id: 'js_enable_laser' });
  expectError('issue for objective without definition', notCertifiable, 'objective_not_certifiable');

  let total = 0;

  // ducktypium-chest: 他ユーザーの提出は拒否、不正解は 0 点、正解で認定
  const duck = await issue('issue ducktypium-chest', tokenA, 'challenge-questions', 'ducktypium-chest');
  expectError('submit by another user', await submit('submit by another user', tokenB, duck.challenge_id, { words: 'jah vuh skrept' }), 'challenge_not_found');
  const wrong = row('submit incorrect', await submit('submit incorrect', tokenA, duck.challenge_id, { words: 'skrept jah vuh' }));
  if (wrong.status !== 'incorrect' || wrong.points_awarded !== 0) fail('submit incorrect', JSON.stringify(wrong));
  ok('submit incorrect -> 0 points');
  const duck2 = await issue('issue ducktypium-chest (retry)', tokenA, 'challenge-questions', 'ducktypium-chest');
  const good = row('submit ducktypium-chest', await submit('submit ducktypium-chest', tokenA, duck2.challenge_id, { words: '  JAH vuh Skrept ' }));
  if (good.status !== 'certified' || !good.newly_certified || good.points_awarded <= 0) fail('submit ducktypium-chest', JSON.stringify(good));
  total += good.points_awarded;
  ok('ducktypium-chest certified');
  const replay = row('resubmit', await submit('resubmit', tokenA, duck2.challenge_id, { words: 'jah vuh skrept' }));
  if (replay.status !== 'certified' || replay.newly_certified) fail('resubmit', JSON.stringify(replay));
  ok('resubmit -> stored result, not newly certified');
  expectError('issue after certified', await call('issue after certified', tokenA, 'issue_certification_challenge', { p_mission_id: 'challenge-questions', p_objective_id: 'ducktypium-chest' }), 'already_certified');

  // array2D: 同じチャレンジへの同時提出 -> 認定はちょうど 1 件
  const arr = await issue('issue array2D', tokenA, 'javascript', 'array2D');
  const same = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    submit(`concurrent same challenge #${i}`, tokenA, arr.challenge_id, { answer1: 'dogs', answer2: 'hockey' })));
  const sameRows = same.map((r, i) => row(`concurrent same challenge #${i}`, r));
  if (sameRows.filter(r => r.newly_certified).length !== 1 || sameRows.some(r => r.status !== 'certified')) {
    fail('concurrent same challenge', JSON.stringify(sameRows));
  }
  total += sameRows.find(r => r.newly_certified).points_awarded;
  ok('array2D: concurrent submits to one challenge -> exactly one newly_certified');

  // sum-array: 同じ目標の別々のチャレンジへの同時提出 -> 加点は 1 回
  const s1 = await issue('issue sum-array #1', tokenA, 'challenge-questions', 'sum-array');
  const s2 = await issue('issue sum-array #2', tokenA, 'challenge-questions', 'sum-array');
  for (const s of [s1, s2]) {
    if (!Array.isArray(s.inputs) || s.inputs.length < 1) fail('sum-array inputs', JSON.stringify(s.inputs));
  }
  const malformed = await submit('sum-array malformed', tokenA, s1.challenge_id, ['not-a-vector-of-the-right-length', 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  if (malformed.status !== 400 || !malformed.json || malformed.json.code !== '22023') {
    fail('sum-array malformed', `HTTP ${malformed.status} ${malformed.json && malformed.json.code} (期待: 400 / 22023。形式の誤りは消費しない)`);
  }
  ok('sum-array malformed result -> rejected (challenge not consumed)');
  const both = await Promise.all([s1, s2].map((s, i) =>
    submit(`concurrent different challenges #${i}`, tokenA, s.challenge_id, sum(s.inputs))));
  const bothRows = both.map((r, i) => row(`concurrent different challenges #${i}`, r));
  const winners = bothRows.filter(r => r.newly_certified);
  const losers = bothRows.filter(r => !r.newly_certified);
  if (winners.length !== 1 || losers.length !== 1 || losers[0].status !== 'already_certified' || losers[0].points_awarded !== 0) {
    fail('concurrent different challenges', JSON.stringify(bothRows));
  }
  total += winners[0].points_awarded;
  ok('sum-array: concurrent submits to two challenges -> exactly one newly_certified');

  return total;
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

  // 所属中に認定した達成が 0 以外の貢献点として集計される
  // 他の実行や既存の達成 (SMOKETEAM1 の他メンバー) を除くため、提出前の値との差分で比較する
  const before = await call('get_group_contribution (baseline)', tokenA, 'get_group_contribution', { p_group_id: groupId });
  if (before.status !== 200 || !before.json || !before.json[0]) fail('get_group_contribution (baseline)', `HTTP ${before.status}`);
  const baseline = Number(before.json[0].total_points);
  const certifiedTotal = await checkCertification(apiUrl, key, tokenA, tokenB);

  const mine = await call('get_group_contribution', tokenA, 'get_group_contribution', { p_group_id: groupId });
  if (mine.status !== 200 || Number(mine.json[0].total_points) - baseline !== certifiedTotal || certifiedTotal <= 0) {
    fail('get_group_contribution', `HTTP ${mine.status} total=${mine.json && mine.json[0] && mine.json[0].total_points} baseline=${baseline} (期待の差分: ${certifiedTotal})`);
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
