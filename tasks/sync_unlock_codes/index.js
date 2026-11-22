// 運用者が用意した解除コードの対応表を検証してから Supabase に公開する。
//   npm run sync:unlock-codes -- --target local|remote --file <リポジトリ外の JSON>
// 書き込みは service_role だけが実行できる RPC (publish_unlock_codes) 1 回。
// 入力に無いコードは退役する (削除しない)。コードの値はログに出さない。
// 実際の対応表はリポジトリに含めない。詳細は docs/supabase/unlocks-and-trees.md。

const fs = require('fs');
const path = require('path');
const chalk = require('chalk').default;
const { getBundledExtensionPaths } = require('../utils/bundledExtensions');
const { resolveTarget, TargetError } = require('../sync_missions/target');
const { validateMapping, readItemKeys, MappingError } = require('./mapping');

const repoRoot = path.resolve(__dirname, '..', '..');
const COMMAND = 'sync:unlock-codes';
const FILE_USAGE = `使い方: npm run ${COMMAND} -- --target <local|remote> --file <リポジトリ外の JSON ファイル>`;

class UsageError extends Error {}

function parseFileArg(argv) {
  let value;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') {
      value = argv[i + 1];
      i += 1;
    } else if (argv[i].startsWith('--file=')) {
      value = argv[i].slice('--file='.length);
    }
  }
  if (!value) throw new UsageError(`--file に対応表の JSON ファイルを指定すること\n${FILE_USAGE}`);
  return path.resolve(value);
}

// 実際のコードをリポジトリにコミットしないよう、リポジトリ内のファイルは受け付けない。
// Symbolic links are resolved (a file may not exist yet: its directory is).
function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch (error) {
    try {
      return path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
    } catch (inner) {
      return path.resolve(target);
    }
  }
}

function assertOutsideRepository(file) {
  const relative = path.relative(realPath(repoRoot), realPath(file));
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (!outside) {
    throw new UsageError('対応表はリポジトリの外に置くこと (実際のコードをコミットしないため)');
  }
}

function readMappingFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new UsageError(`対応表を読めない (${error.code || error.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError('対応表が JSON として不正');
  }
}

async function publishCodes(target, payload, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${target.url}/rest/v1/rpc/publish_unlock_codes`, {
      method: 'POST',
      headers: {
        apikey: target.key,
        Authorization: `Bearer ${target.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
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
    throw new Error(`解除コードの公開に失敗した: HTTP ${response.status} ${detail}`.trim());
  }
  return response.json();
}

async function run(argv = process.argv.slice(2)) {
  const file = parseFileArg(argv);
  assertOutsideRepository(file);
  const payload = validateMapping(readMappingFile(file), readItemKeys(getBundledExtensionPaths()));
  const target = resolveTarget(argv, { command: COMMAND });

  console.log(
    `${chalk.blue.bold('Publishing')} ${payload.codes.length} unlock codes to ${target.name} (${new URL(target.url).hostname})`
  );
  const result = await publishCodes(target, payload);
  console.log(
    `inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged} retired=${result.retired}`
  );
  console.log(chalk.green.bold('Done'));
  return result;
}

module.exports = { run, publishCodes, parseFileArg, assertOutsideRepository, UsageError };

if (require.main === module) {
  run().catch(error => {
    const known = error instanceof TargetError || error instanceof UsageError || error instanceof MappingError;
    console.error(known ? error.message : `[${COMMAND}] ${error.message}`);
    process.exit(1);
  });
}
