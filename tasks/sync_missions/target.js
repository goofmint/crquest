// 発行先 (--target local|remote) の解決。既定の接続先は無い。
// 資格情報は環境変数 (remote) または `supabase status` (local) から取得し、ログには出さない。

const { readLocalStatus, isLoopbackUrl } = require('../shared/supabaseLocal');

const USAGE = [
  '使い方: npm run sync:missions -- --target <local|remote>',
  '  local : `supabase status` のローカルスタック (ループバックのみ)',
  '  remote: TERMINALQUEST_CATALOG_SUPABASE_URL / TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY (https のみ)',
].join('\n');

class TargetError extends Error {}

function parseTargetArg(argv) {
  let value;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      value = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--target=')) {
      value = arg.slice('--target='.length);
    }
  }
  if (value !== 'local' && value !== 'remote') {
    throw new TargetError(
      `--target に local または remote を指定すること (指定: ${value ?? 'なし'})\n${USAGE}`
    );
  }
  return value;
}

function resolveLocal(readStatus) {
  const status = readStatus();
  const url = status.API_URL;
  const key = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  if (!url || !key) {
    throw new TargetError('ローカルスタックの API URL またはサービスキーを取得できない');
  }
  if (!isLoopbackUrl(url)) {
    throw new TargetError(
      `--target local はループバック (127.0.0.1 / localhost / ::1) のみ許可する (ホスト: ${new URL(url).hostname})`
    );
  }
  return { name: 'local', url: url.replace(/\/+$/, ''), key };
}

function resolveRemote(env) {
  // 既定の .env を読む (process.env を使うときだけ。既に設定済みの値は上書きしない)。
  if (env === process.env) require('dotenv').config({ quiet: true });
  const url = env.TERMINALQUEST_CATALOG_SUPABASE_URL;
  const key = env.TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY;
  const missing = [
    ['TERMINALQUEST_CATALOG_SUPABASE_URL', url],
    ['TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY', key],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new TargetError(
      `--target remote には環境変数が必要: ${missing.join(', ')} (.env.supabase.template を参照)`
    );
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new TargetError('TERMINALQUEST_CATALOG_SUPABASE_URL が URL として不正');
  }
  if (parsed.protocol !== 'https:') {
    throw new TargetError('--target remote は https の URL のみ許可する');
  }
  return { name: 'remote', url: url.replace(/\/+$/, ''), key };
}

/**
 * @returns {{name: string, url: string, key: string}}
 */
function resolveTarget(argv, { env = process.env, readStatus = readLocalStatus } = {}) {
  const target = parseTargetArg(argv);
  return target === 'local' ? resolveLocal(readStatus) : resolveRemote(env);
}

module.exports = { resolveTarget, parseTargetArg, TargetError, USAGE };
