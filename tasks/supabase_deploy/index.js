#!/usr/bin/env node
// Supabase Cloud へのデプロイ (#194): マイグレーションと Edge Functions を展開する。
//   npm run deploy:supabase -- --env <staging|production> --project-ref <ref> [--dry-run] [--confirm-project-ref <ref>]
// 事前検証 (環境名・project ref の照合) が通るまで CLI を一切起動しない。
//   - --env は TERMINALQUEST_DEPLOY_ENVIRONMENT と、--project-ref は SUPABASE_PROJECT_REF と一致すること。
//   - 本番は --confirm-project-ref (対象 ref の再入力) も必須。
// seed は適用せず (--include-seed なし)、JWT 検証は無効化しない (--no-verify-jwt なし)、--prune も使わない。
// 資格情報 (SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD) は環境変数でだけ渡し、引数やログには出さない。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const ENVIRONMENTS = ['staging', 'production'];
const REF_PATTERN = /^[a-z]{20}$/;
const REQUIRED_CREDENTIALS = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD'];

const USAGE = [
  '使い方: npm run deploy:supabase -- --env <staging|production> --project-ref <ref> [--dry-run]',
  '  本番は --confirm-project-ref <ref> も必須',
  '  環境変数: TERMINALQUEST_DEPLOY_ENVIRONMENT, SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD',
].join('\n');

class DeployError extends Error {}

const FLAGS = ['env', 'project-ref', 'confirm-project-ref'];

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const name = FLAGS.find(flag => arg === `--${flag}` || arg.startsWith(`--${flag}=`));
    if (!name) throw new DeployError(`不明な引数: ${arg}\n${USAGE}`);
    let value;
    if (arg.includes('=')) {
      value = arg.slice(arg.indexOf('=') + 1);
    } else {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new DeployError(`${arg} に値が指定されていない\n${USAGE}`);
      }
      i += 1;
    }
    const key = name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
    options[key] = value;
  }
  return options;
}

// 不一致があれば DeployError。通ったら { env, ref, dryRun } を返す。
function validate(options, env) {
  if (!ENVIRONMENTS.includes(options.env)) {
    throw new DeployError(
      `--env に staging または production を指定すること (指定: ${options.env ?? 'なし'})\n${USAGE}`
    );
  }
  if (!options.projectRef || !REF_PATTERN.test(options.projectRef)) {
    throw new DeployError('--project-ref は英小文字 20 文字の project ref であること');
  }
  if (env.TERMINALQUEST_DEPLOY_ENVIRONMENT !== options.env) {
    throw new DeployError(
      `--env (${options.env}) が TERMINALQUEST_DEPLOY_ENVIRONMENT (${env.TERMINALQUEST_DEPLOY_ENVIRONMENT || '未設定'}) と一致しない`
    );
  }
  if (env.SUPABASE_PROJECT_REF !== options.projectRef) {
    throw new DeployError('--project-ref が環境変数 SUPABASE_PROJECT_REF と一致しない (未設定を含む)');
  }
  const missing = REQUIRED_CREDENTIALS.filter(name => !env[name]);
  if (missing.length > 0) {
    throw new DeployError(`環境変数が未設定: ${missing.join(', ')}`);
  }
  if (options.env === 'production' && options.confirmProjectRef !== options.projectRef) {
    throw new DeployError('本番は --confirm-project-ref に対象の project ref を再入力すること (不一致または未指定)');
  }
  return { env: options.env, ref: options.projectRef, dryRun: options.dryRun };
}

function listFunctions(functionsDir = path.join(repoRoot, 'supabase', 'functions')) {
  return fs
    .readdirSync(functionsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
}

// 実行する CLI 引数の列。固定。
// --remote=<ref> で検証済みの ref を明示する (値なしの --remote は SUPABASE_PROJECT_ID や古いリンクを使い得る)。
function buildSteps(ref, dryRun, functions) {
  const remote = `--remote=${ref}`;
  const steps = [
    { name: 'link', args: ['link', '--project-ref', ref] },
    { name: 'migration list', args: ['migration', 'list', remote] },
    { name: 'db push (dry-run)', args: ['db', 'push', remote, '--dry-run'] },
  ];
  if (!dryRun) {
    steps.push({ name: 'db push', args: ['db', 'push', remote, '--yes'] });
    for (const fn of functions) {
      steps.push({ name: `functions deploy ${fn}`, args: ['functions', 'deploy', fn, remote, '--yes'] });
    }
  }
  return steps;
}

function defaultRunner(args, env) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    // Windows の npx は npx.cmd のため shell 経由でのみ起動できる。引数は固定値。
    shell: process.platform === 'win32',
  });
  return result.status;
}

// run(args, env) は終了コードを返す。テストでは差し替える。
function deploy(argv, env = process.env, { run = defaultRunner, functions = listFunctions(), log = console.log } = {}) {
  const { env: target, ref, dryRun } = validate(parseArgs(argv), env);
  log(`[deploy] 環境=${target} dry-run=${dryRun}`);
  for (const step of buildSteps(ref, dryRun, functions)) {
    log(`[deploy] ---- ${step.name}`);
    const status = run(step.args, env);
    if (status !== 0) {
      throw new DeployError(`手順に失敗した: ${step.name} (exit ${status}) 後続は実行しない`);
    }
  }
  log(dryRun ? '[deploy] dry-run 完了 (変更は適用していない)' : '[deploy] 完了');
}

if (require.main === module) {
  try {
    deploy(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;
    console.error(`[deploy] ERROR ${error.message}`);
    process.exit(1);
  }
}

module.exports = { parseArgs, validate, buildSteps, listFunctions, deploy, DeployError, REF_PATTERN };
