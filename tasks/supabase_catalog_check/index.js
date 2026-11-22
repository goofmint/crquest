#!/usr/bin/env node
// ローカル Supabase スタックでミッションカタログを HTTP レベルで検証する。
//   1. 初回公開と再公開 (2 回目は inserted / updated が 0)
//   2. 公開キーだけ / 一般ユーザーのトークンでは、カタログの書き込みと RPC が拒否される
//   3. 拒否のあとでカタログが変わっていない
// ローカル専用 (--remote / --linked / DB URL は使わない)。キーとトークンはログに出さない。

const crypto = require('crypto');

const { readLocalStatus, isLoopbackUrl } = require('../shared/supabaseLocal');
const { loadCatalog, publishCatalog } = require('../sync_missions/supabase');

// 例外で失敗を伝える (process.exit は finally を飛ばし、使い捨てユーザーが残るため)。
class CheckError extends Error {}

function fail(step, detail) {
  throw new CheckError(`${step}: ${detail}`);
}

function ok(step) {
  console.log(`[catalog-check] ok   ${step}`);
}

async function request(step, url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    return fail(step, `接続できない (${error.cause ? error.cause.code : error.message})`);
  }
}

// token が null のときは Authorization を付けない (公開キーだけの要求)。
function headers(apikey, token) {
  const result = { apikey, 'Content-Type': 'application/json' };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

async function snapshot(apiUrl, serviceKey) {
  const out = {};
  for (const table of ['missions', 'mission_objectives']) {
    const res = await request(`read ${table}`, `${apiUrl}/rest/v1/${table}?select=*&order=id`, {
      headers: headers(serviceKey, serviceKey),
    });
    if (res.status !== 200) fail(`read ${table}`, `HTTP ${res.status}`);
    out[table] = JSON.stringify(await res.json());
  }
  return out;
}

async function expectDenied(apiUrl, label, apikey, token) {
  const attempts = [
    ['POST missions', 'POST', 'missions', { id: 'evil', extension: 'x', title: 't', description: 'd', sort_order: 0 }],
    ['PATCH missions', 'PATCH', 'missions?id=neq.', { title: 'hacked' }],
    ['DELETE missions', 'DELETE', 'missions?id=neq.', undefined],
    ['POST mission_objectives', 'POST', 'mission_objectives', { mission_id: 'evil', id: 'o', title: 't', description: 'd', xp: 1, sort_order: 0 }],
    ['PATCH mission_objectives', 'PATCH', 'mission_objectives?id=neq.', { xp: 999999 }],
    ['DELETE mission_objectives', 'DELETE', 'mission_objectives?id=neq.', undefined],
    ['RPC publish_mission_catalog', 'POST', 'rpc/publish_mission_catalog', { catalog: { missions: [] } }],
  ];
  for (const [name, method, resource, body] of attempts) {
    const res = await request(`${label} ${name}`, `${apiUrl}/rest/v1/${resource}`, {
      method,
      headers: headers(apikey, token),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== 401 && res.status !== 403) {
      fail(`${label} ${name}`, `HTTP ${res.status} (期待値 401 または 403)`);
    }
  }
  ok(`${label}: 書き込みと RPC はすべて拒否`);
}

async function main() {
  let status;
  try {
    status = readLocalStatus();
  } catch (error) {
    fail('status', error.message);
  }
  const apiUrl = status.API_URL;
  const publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  if (!apiUrl || !publishableKey || !serviceKey) fail('status', 'API URL またはキーを取得できない');
  if (!isLoopbackUrl(apiUrl)) fail('status', 'ローカル (ループバック) 以外には接続しない');

  const target = { name: 'local', url: apiUrl, key: serviceKey };
  const catalog = await loadCatalog();

  await publishCatalog(target, catalog);
  const second = await publishCatalog(target, catalog);
  for (const kind of ['missions', 'objectives']) {
    if (second[kind].inserted !== 0 || second[kind].updated !== 0) {
      fail('republish', `${kind} が変化した (再公開で inserted / updated が 0 でない)`);
    }
  }
  ok('publish twice -> 2 回目は inserted / updated が 0');

  const baseline = await snapshot(apiUrl, serviceKey);

  // 公開キーが有効であること (読み取りが成功する) を確認してから、書き込みの拒否を検証する
  const read = await request('publishable key read', `${apiUrl}/rest/v1/missions?select=id&limit=1`, {
    headers: headers(publishableKey, null),
  });
  if (read.status !== 200) fail('publishable key read', `HTTP ${read.status} (期待値 200)`);
  ok('publishable key: 公開テーブルの読み取りは成功');

  await expectDenied(apiUrl, 'publishable key', publishableKey, null);

  let userId;
  try {
    const email = `catalog-check-${crypto.randomUUID()}@example.test`;
    const password = crypto.randomBytes(16).toString('hex');
    const created = await request('create user', `${apiUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: headers(serviceKey, serviceKey),
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (created.status !== 200 && created.status !== 201) fail('create user', `HTTP ${created.status}`);
    userId = (await created.json()).id;

    const signin = await request('sign in', `${apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (signin.status !== 200) fail('sign in', `HTTP ${signin.status}`);
    const accessToken = (await signin.json()).access_token;
    if (!accessToken) fail('sign in', 'access_token がない');

    await expectDenied(apiUrl, 'authenticated user', publishableKey, accessToken);
  } finally {
    if (userId) {
      await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: headers(serviceKey, serviceKey),
      }).catch(() => {});
    }
  }

  const after = await snapshot(apiUrl, serviceKey);
  if (after.missions !== baseline.missions || after.mission_objectives !== baseline.mission_objectives) {
    fail('catalog unchanged', '拒否された要求のあとでカタログが変わった');
  }
  ok('catalog unchanged after denied writes');

  console.log('[catalog-check] all checks passed');
}

main().catch(error => {
  const detail = error instanceof CheckError ? error.message : `unexpected: ${error.message}`;
  console.error(`[catalog-check] FAIL ${detail}`);
  process.exit(1);
});
