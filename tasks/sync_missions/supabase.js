// 同梱ミッション・目標・報酬 XP を Supabase のカタログへ一括 upsert する。
//   npm run sync:missions -- --target local|remote
// 書き込みは service_role だけが実行できる RPC (publish_mission_catalog) 1 回。
// Firestore 版は tasks/sync_missions/index.js (sync:missions:firestore)。

const chalk = require('chalk').default;
const { getBundledExtensionPaths } = require('../utils/bundledExtensions');
const { readLevels } = require('../utils/readLevels');
const { buildCatalog } = require('./catalog');
const { resolveTarget, TargetError } = require('./target');
const path = require('path');

async function loadCatalog(extensionPaths = getBundledExtensionPaths()) {
  const sources = await Promise.all(
    extensionPaths.map(async extensionPath => ({
      extensionName: path.basename(extensionPath),
      levels: await readLevels(extensionPath),
    }))
  );
  return buildCatalog(sources);
}

async function publishCatalog(target, catalog, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${target.url}/rest/v1/rpc/publish_mission_catalog`, {
      method: 'POST',
      headers: {
        apikey: target.key,
        Authorization: `Bearer ${target.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ catalog }),
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
    throw new Error(`カタログの発行に失敗した: HTTP ${response.status} ${detail}`.trim());
  }
  return response.json();
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
  console.log(chalk.green.bold('Done'));
  return result;
}

module.exports = { loadCatalog, publishCatalog, run };

if (require.main === module) {
  run().catch(error => {
    console.error(
      error instanceof TargetError ? error.message : `[sync:missions] ${error.message}`
    );
    process.exit(1);
  });
}
