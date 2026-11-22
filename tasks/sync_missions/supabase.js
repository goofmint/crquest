// 同梱ミッション・目標・報酬 XP を Supabase のカタログへ一括 upsert する。
//   npm run sync:missions -- --target local|remote
// 書き込みは service_role だけが実行できる RPC (publish_mission_catalog) 1 回。

const chalk = require('chalk').default;
const { getBundledExtensionPaths } = require('../utils/bundledExtensions');
const { readLevels } = require('../utils/readLevels');
const { buildCatalog } = require('./catalog');
const { resolveTarget, TargetError } = require('./target');
const fs = require('fs');
const path = require('path');

const VERIFICATION_DEFINITIONS_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'verification', 'definitions.json'
);

async function loadCatalog(extensionPaths = getBundledExtensionPaths()) {
  const sources = await Promise.all(
    extensionPaths.map(async extensionPath => ({
      extensionName: path.basename(extensionPath),
      levels: await readLevels(extensionPath),
    }))
  );
  return buildCatalog(sources);
}

// サーバー専用の検証定義 (supabase/verification/definitions.json)。クライアント配布物 (objective.json など) からは作らない。
function loadVerificationDefinitions(file = VERIFICATION_DEFINITIONS_PATH) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.definitions)) {
    throw new Error(`${path.basename(file)}: definitions は配列でなければならない`);
  }
  return { definitions: parsed.definitions };
}

async function callRpc(target, name, args, fetchImpl, label) {
  let response;
  try {
    response = await fetchImpl(`${target.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: target.key,
        Authorization: `Bearer ${target.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (error) {
    throw new Error(
      `${new URL(target.url).hostname} に接続できない (${error.cause ? error.cause.code : error.message})`
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = [body.code, body.message].filter(Boolean).join(' ');
    } catch (error) {
      // 本文が JSON でない場合はステータスだけを示す
    }
    throw new Error(`${label}に失敗した: HTTP ${response.status} ${detail}`.trim());
  }
  return response.json();
}

function publishCatalog(target, catalog, fetchImpl = fetch) {
  return callRpc(target, 'publish_mission_catalog', { catalog }, fetchImpl, 'カタログの発行');
}

function publishVerificationDefinitions(target, definitions, fetchImpl = fetch) {
  return callRpc(
    target,
    'publish_verification_definitions',
    { p_definitions: definitions },
    fetchImpl,
    '検証定義の発行'
  );
}

function summarize(counts) {
  return `inserted=${counts.inserted} updated=${counts.updated} unchanged=${counts.unchanged} retired=${counts.retired}`;
}

async function run(argv = process.argv.slice(2)) {
  const target = resolveTarget(argv);
  const catalog = await loadCatalog();
  const objectiveCount = catalog.missions.reduce((n, m) => n + m.objectives.length, 0);

  console.log(
    `${chalk.blue.bold('Publishing')} ${catalog.missions.length} missions / ${objectiveCount} objectives to ${target.name} (${new URL(target.url).hostname})`
  );

  const result = await publishCatalog(target, catalog);

  console.log(`missions:   ${summarize(result.missions)}`);
  console.log(`objectives: ${summarize(result.objectives)}`);

  // 検証定義はカタログ (目標の存在) に依存するため、カタログの後に発行する
  const definitions = loadVerificationDefinitions();
  const defResult = await publishVerificationDefinitions(target, definitions);
  console.log(
    `verification definitions: inserted=${defResult.inserted} updated=${defResult.updated} unchanged=${defResult.unchanged} deleted=${defResult.deleted}`
  );
  console.log(chalk.green.bold('Done'));
  return result;
}

module.exports = {
  loadCatalog,
  publishCatalog,
  loadVerificationDefinitions,
  publishVerificationDefinitions,
  run,
};

if (require.main === module) {
  run().catch(error => {
    console.error(
      error instanceof TargetError ? error.message : `[sync:missions] ${error.message}`
    );
    process.exit(1);
  });
}
