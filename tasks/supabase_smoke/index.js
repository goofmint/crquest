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

// この実行で作ったユーザーのメールアドレス。公開 RPC の応答に含まれてはならない。
const knownPrivateValues = [];

async function signUp(apiUrl, key, step) {
  const email = `smoke-${crypto.randomUUID()}@example.test`;
  knownPrivateValues.push(email);
  const response = await request(step, `${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
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
async function checkGroups(apiUrl, key, tokenA, teamCode, event) {
  const tokenB = await signUp(apiUrl, key, 'groups signup (2nd user)');
  const call = (step, token, name, args) => rpc(step, apiUrl, key, token, name, args);

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

  // ライブイベント: 認定の前に参加しておく (計上は参加後の認定から)。B は表示しない参加者
  await checkLiveEventsBefore(apiUrl, key, tokenA, tokenB, event);

  // 所属中に認定した達成が 0 以外の貢献点として集計される
  // この実行専用のグループなので、同時に走る別のスモークの影響を受けない。念のため提出前の値との差分で比較する
  const before = await call('get_group_contribution (baseline)', tokenA, 'get_group_contribution', { p_group_id: groupId });
  if (before.status !== 200 || !before.json || !before.json[0]) fail('get_group_contribution (baseline)', `HTTP ${before.status}`);
  const baseline = Number(before.json[0].total_points);
  const certifiedTotal = await checkCertification(apiUrl, key, tokenA, tokenB);

  const mine = await call('get_group_contribution', tokenA, 'get_group_contribution', { p_group_id: groupId });
  if (mine.status !== 200 || Number(mine.json[0].total_points) - baseline !== certifiedTotal || certifiedTotal <= 0) {
    fail('get_group_contribution', `HTTP ${mine.status} total=${mine.json && mine.json[0] && mine.json[0].total_points} baseline=${baseline} (期待の差分: ${certifiedTotal})`);
  }
  ok('get_group_contribution (member)');

  await checkLiveEventsAfter(apiUrl, key, tokenA, tokenB, event, certifiedTotal);

  const left = await call('leave_group', tokenA, 'leave_group', { p_group_id: groupId });
  if (left.status >= 400) fail('leave_group', `HTTP ${left.status}`);
  ok('leave_group (self)');

  const direct = await request('groups direct table access', `${apiUrl}/rest/v1/groups?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${tokenA}` },
  });
  if (direct.status < 400) fail('groups direct table access', `HTTP ${direct.status} (期待: 拒否)`);
  ok('groups direct table access -> denied');
}

// 公開しない項目 (内部 ID、グループ ID、参加コード、メール、セーブ) が応答に含まれないこと。
const PRIVATE_KEY_PATTERN = /user_id|group_id|join_code|email|save|token|required_group/i;
function expectPublicOnly(step, json) {
  const keys = [];
  for (const row of Array.isArray(json) ? json : []) keys.push(...Object.keys(row));
  if (keys.some(k => PRIVATE_KEY_PATTERN.test(k))) fail(step, `非公開の列が含まれている: ${keys.join(',')}`);
  const text = JSON.stringify(json).toLowerCase();
  if (knownPrivateValues.some(value => text.includes(value.toLowerCase()))) fail(step, '利用者のメールアドレスが含まれている');
}

// ライブイベントを実 JWT / PostgREST で検証する (イベントは service_role が実行ごとに作る)。
// 認定の前に参加し (計上は参加後の認定から)、認定後にスコアと順位が台帳の加点と一致することを確認する。
async function checkLiveEventsBefore(apiUrl, key, tokenA, tokenB, event) {
  const call = (step, token, name, args) => rpc(step, apiUrl, key, token, name, args);
  const id = event.id;

  const list = await call('list_live_events (anon)', null, 'list_live_events', {});
  if (list.status !== 200 || !list.json.some(e => e.event_id === id && e.phase === 'active' && e.is_open === true)) {
    fail('list_live_events (anon)', `HTTP ${list.status}`);
  }
  if (list.json.some(e => e.event_id === event.draftId)) fail('list_live_events (anon)', '下書きのイベントが含まれている');
  expectPublicOnly('list_live_events (anon)', list.json);
  ok('list_live_events (anon) -> published only, public columns only');

  const anonJoin = await call('join_live_event (anon)', null, 'join_live_event', { p_event_id: id, p_display_name: 'Anon', p_show_in_ranking: true });
  if (anonJoin.status !== 401 && anonJoin.status !== 403) fail('join_live_event (anon)', `HTTP ${anonJoin.status} (期待値 401/403)`);
  ok('join_live_event (anon) -> denied');

  const join = (step, token, eventId, name, show) =>
    call(step, token, 'join_live_event', { p_event_id: eventId, p_display_name: name, p_show_in_ranking: show });
  expectError('join draft event', await join('join draft event', tokenA, event.draftId, 'A', true), 'event_not_found');
  expectError('join closed event', await join('join closed event', tokenA, event.endedId, 'A', true), 'event_closed');
  expectError('join with invalid name', await join('join with invalid name', tokenA, id, '   ', true), 'invalid_display_name');

  const joinA = await join('join_live_event (A)', tokenA, id, event.nameA, true);
  if (joinA.status !== 200 || joinA.json.length !== 1) fail('join_live_event (A)', `HTTP ${joinA.status} ${(joinA.json && joinA.json.message) || ''}`);
  expectError('join twice', await join('join twice', tokenA, id, event.nameA, true), 'already_participant');
  const joinB = await join('join_live_event (B, hidden)', tokenB, id, event.nameB, false);
  if (joinB.status !== 200) fail('join_live_event (B, hidden)', `HTTP ${joinB.status}`);
  ok('join_live_event (visible and hidden participants)');

  const direct = await request('live event direct table access', `${apiUrl}/rest/v1/live_event_participants?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${tokenA}` },
  });
  if (direct.status < 400) fail('live event direct table access', `HTTP ${direct.status} (期待: 拒否)`);
  ok('live_event_participants direct table access -> denied');

  const before = await call('get_live_event_ranking (before)', null, 'get_live_event_ranking', { p_event_id: id });
  const mine = (before.json || []).find(r => r.display_name === event.nameA);
  if (before.status !== 200 || !mine || Number(mine.score) !== 0) fail('get_live_event_ranking (before)', `HTTP ${before.status}`);
  if (before.json.some(r => r.display_name === event.nameB)) fail('get_live_event_ranking (before)', '非表示の参加者が含まれている');
  expectPublicOnly('get_live_event_ranking (before)', before.json);
  ok('get_live_event_ranking (anon): visible participant at 0, hidden excluded, public columns only');
}

async function checkLiveEventsAfter(apiUrl, key, tokenA, tokenB, event, certifiedTotal) {
  const call = (step, token, name, args) => rpc(step, apiUrl, key, token, name, args);
  const id = event.id;

  const ranking = await call('get_live_event_ranking (after)', null, 'get_live_event_ranking', { p_event_id: id });
  const mine = (ranking.json || []).find(r => r.display_name === event.nameA);
  if (ranking.status !== 200 || !mine || Number(mine.score) !== certifiedTotal || Number(mine.rank) !== 1 || Number(mine.achievement_count) < 1) {
    fail('get_live_event_ranking (after)', `HTTP ${ranking.status} score=${mine && mine.score} (期待: ${certifiedTotal})`);
  }
  if (ranking.json.some(r => r.display_name === event.nameB)) fail('get_live_event_ranking (after)', '非表示の参加者が含まれている');
  ok('get_live_event_ranking (anon): certified points counted for the participant');

  const status = await call('get_my_live_event_status (A)', tokenA, 'get_my_live_event_status', { p_event_id: id });
  if (status.status !== 200 || !status.json[0] || status.json[0].joined !== true || Number(status.json[0].score) !== certifiedTotal) {
    fail('get_my_live_event_status (A)', `HTTP ${status.status}`);
  }
  const hidden = await call('get_my_live_event_status (B)', tokenB, 'get_my_live_event_status', { p_event_id: id });
  if (hidden.status !== 200 || !hidden.json[0] || hidden.json[0].rank !== null || Number(hidden.json[0].score) !== 0) {
    fail('get_my_live_event_status (B)', `HTTP ${hidden.status} (非表示の参加者に順位を返してはならない)`);
  }
  ok('get_my_live_event_status: own score, no rank for a hidden participant');

  const teams = await call('get_live_event_team_ranking', null, 'get_live_event_team_ranking', { p_event_id: id });
  const team = (teams.json || []).find(r => r.display_name === event.teamName);
  if (teams.status !== 200 || !team || Number(team.score) !== certifiedTotal || Number(team.contributor_count) !== 1) {
    fail('get_live_event_team_ranking', `HTTP ${teams.status} (期待: ${event.teamName} が ${certifiedTotal} 点)`);
  }
  expectPublicOnly('get_live_event_team_ranking', teams.json);
  ok('get_live_event_team_ranking (anon): team score equals certified points, public columns only');

  // 二重提出: 認定済みの目標は再発行できず、スコアは増えない
  const again = await call('re-issue certified objective', tokenA, 'issue_certification_challenge', { p_mission_id: 'challenge-questions', p_objective_id: 'ducktypium-chest' });
  expectError('re-issue certified objective', again, 'already_certified');
  const recount = await call('get_live_event_ranking (recount)', null, 'get_live_event_ranking', { p_event_id: id });
  const same = (recount.json || []).find(r => r.display_name === event.nameA);
  if (!same || Number(same.score) !== certifiedTotal) fail('get_live_event_ranking (recount)', 'スコアが変わった');
  ok('score unchanged after a duplicate attempt');
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
  knownPrivateValues.push(email);
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

  // 実行ごとに専用のグループを service_role で作る (共有の SMOKETEAM1 を使うと、同時実行で貢献点が混ざる)
  const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!serviceKey) fail('status', 'service_role のキーを取得できない');
  const teamCode = `SMOKE${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const created = await request('create per-run group', `${apiUrl}/rest/v1/groups`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ kind: 'team', display_name: `Smoke Team ${teamCode}`, join_code: teamCode }),
  });
  if (created.status !== 201) fail('create per-run group', `HTTP ${created.status}`);
  const runGroupId = (await created.json())[0].id;
  ok('create per-run group');

  // 実行ごとに専用のライブイベント (開催中・下書き・終了済み) を service_role で作る
  const runTag = crypto.randomBytes(4).toString('hex');
  const hour = 3600 * 1000;
  const createEvent = async (title, status, startsAt, endsAt) => {
    const response = await request('create per-run live event', `${apiUrl}/rest/v1/live_events`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ title: `${title} ${runTag}`, status, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() }),
    });
    if (response.status !== 201) fail('create per-run live event', `HTTP ${response.status}`);
    return (await response.json())[0].id;
  };
  const now = Date.now();
  const event = {
    id: await createEvent('Smoke Event', 'published', now - hour, now + 24 * hour),
    draftId: await createEvent('Smoke Draft', 'draft', now - hour, now + 24 * hour),
    endedId: await createEvent('Smoke Ended', 'published', now - 48 * hour, now - 24 * hour),
    nameA: `Smoke A ${runTag}`,
    nameB: `Smoke B ${runTag}`,
    teamName: `Smoke Team ${teamCode}`,
  };
  ok('create per-run live events');

  await checkGroups(apiUrl, key, body.access_token, teamCode, event);

  // 後始末 (所属履歴・参加記録は CASCADE。台帳は使い捨てユーザーのもの)
  for (const eventId of [event.id, event.draftId, event.endedId]) {
    await fetch(`${apiUrl}/rest/v1/live_events?id=eq.${eventId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).catch(() => {});
  }
  await fetch(`${apiUrl}/rest/v1/groups?id=eq.${runGroupId}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).catch(() => {});

  console.log('[smoke] all checks passed');
}

main().catch(error => fail('unexpected', error.message));
