const fs = require('fs');
const path = require('path');
const { parseArgs, validate, buildSteps, listFunctions, deploy, DeployError } = require('../../../tasks/supabase_deploy');
const { resolveTarget, verify, VerifyError } = require('../../../tasks/supabase_deploy/verify');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const REF = 'abcdefghijklmnopqrst';
const OTHER_REF = 'tsrqponmlkjihgfedcba';
const TOKEN = 'SENTINEL-ACCESS-TOKEN';
const PASSWORD = 'SENTINEL-DB-PASSWORD';

const baseEnv = (over = {}) => ({
  TERMINALQUEST_DEPLOY_ENVIRONMENT: 'staging',
  SUPABASE_PROJECT_REF: REF,
  SUPABASE_ACCESS_TOKEN: TOKEN,
  SUPABASE_DB_PASSWORD: PASSWORD,
  ...over,
});
const stagingArgs = ['--env', 'staging', '--project-ref', REF];
const prodArgs = ['--env', 'production', '--project-ref', REF, '--confirm-project-ref', REF];
const prodEnv = () => baseEnv({ TERMINALQUEST_DEPLOY_ENVIRONMENT: 'production' });

function run(argv, env, extra = {}) {
  const calls = [];
  const logs = [];
  const runner = args => {
    calls.push(args);
    return extra.failAt && calls.length === extra.failAt ? 1 : 0;
  };
  const exec = () => deploy(argv, env, { run: runner, functions: ['health'], log: m => logs.push(m) });
  return { calls, logs, exec };
}

describe('deploy argument and environment validation (no subprocess)', () => {
  it.each([
    ['missing --env', ['--project-ref', REF], baseEnv()],
    ['invalid --env', ['--env', 'prod', '--project-ref', REF], baseEnv()],
    ['--env without a value', ['--project-ref', REF, '--env'], baseEnv()],
    ['--project-ref followed by another flag', ['--env', 'staging', '--project-ref', '--dry-run'], baseEnv()],
    ['unknown argument', [...stagingArgs, '--include-seed'], baseEnv()],
    ['environment mismatch (staging vs production)', stagingArgs, baseEnv({ TERMINALQUEST_DEPLOY_ENVIRONMENT: 'production' })],
    ['environment variable unset', stagingArgs, baseEnv({ TERMINALQUEST_DEPLOY_ENVIRONMENT: undefined })],
    ['ref mismatch', ['--env', 'staging', '--project-ref', OTHER_REF], baseEnv()],
    ['ref env unset', stagingArgs, baseEnv({ SUPABASE_PROJECT_REF: undefined })],
    ['invalid ref format', ['--env', 'staging', '--project-ref', 'ABC'], baseEnv({ SUPABASE_PROJECT_REF: 'ABC' })],
    ['missing access token', stagingArgs, baseEnv({ SUPABASE_ACCESS_TOKEN: '' })],
    ['missing db password', stagingArgs, baseEnv({ SUPABASE_DB_PASSWORD: undefined })],
    ['production without confirmation', ['--env', 'production', '--project-ref', REF], prodEnv()],
    ['production with wrong confirmation', [...prodArgs.slice(0, 4), '--confirm-project-ref', OTHER_REF], prodEnv()],
  ])('rejects: %s, and never runs the CLI', (_name, argv, env) => {
    const { calls, exec } = run(argv, env);
    expect(exec).toThrow(DeployError);
    expect(calls).toEqual([]);
  });

  it('parses --key=value and flags', () => {
    expect(parseArgs([`--env=staging`, `--project-ref=${REF}`, '--dry-run'])).toEqual({
      env: 'staging',
      projectRef: REF,
      dryRun: true,
    });
  });

  it('accepts a valid staging and production request', () => {
    expect(validate(parseArgs(stagingArgs), baseEnv())).toEqual({ env: 'staging', ref: REF, dryRun: false });
    expect(validate(parseArgs(prodArgs), prodEnv()).env).toBe('production');
  });
});

describe('deploy steps', () => {
  it('links, previews, pushes and deploys in order', () => {
    const { calls, exec } = run(stagingArgs, baseEnv());
    exec();
    expect(calls).toEqual([
      ['link', '--project-ref', REF],
      ['migration', 'list', `--remote=${REF}`],
      ['db', 'push', `--remote=${REF}`, '--dry-run'],
      ['db', 'push', `--remote=${REF}`, '--yes'],
      ['functions', 'deploy', 'health', `--remote=${REF}`, '--yes'],
    ]);
  });

  it('never uses a bare --remote', () => {
    const { calls, exec } = run(stagingArgs, baseEnv());
    exec();
    expect(calls.flat()).not.toContain('--remote');
  });

  it('never passes seed, JWT-bypass, prune or credentials', () => {
    const { calls, exec } = run(prodArgs, prodEnv());
    exec();
    const all = calls.flat().join(' ');
    for (const forbidden of ['--include-seed', '--no-verify-jwt', '--prune', '--db-url', '--password', TOKEN, PASSWORD]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it('stops after the dry-run preview with --dry-run', () => {
    const { calls, exec } = run([...stagingArgs, '--dry-run'], baseEnv());
    exec();
    expect(calls).toHaveLength(3);
    expect(calls.flat()).not.toContain('--yes');
    expect(calls.some(args => args[0] === 'functions')).toBe(false);
  });

  it('stops at the first failing step and does not leak credentials', () => {
    const { calls, exec } = run(stagingArgs, baseEnv(), { failAt: 3 });
    let message = '';
    try {
      exec();
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('db push (dry-run)');
    expect(message).not.toContain(TOKEN);
    expect(message).not.toContain(PASSWORD);
    expect(calls).toHaveLength(3);
  });

  it('discovers the functions directory', () => {
    expect(listFunctions()).toContain('health');
    expect(buildSteps(REF, false, ['a', 'b']).filter(s => s.name.startsWith('functions'))).toHaveLength(2);
  });
});

describe('post-deploy verification (mock fetch)', () => {
  const vEnv = (over = {}) => ({
    TERMINALQUEST_SUPABASE_URL: `https://${REF}.supabase.co`,
    TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY: 'SENTINEL-PUBLISHABLE',
    SUPABASE_PROJECT_REF: REF,
    ...over,
  });
  const mockFetch = (statuses = {}) => {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, method: init.method });
      const p = new URL(url).pathname;
      const status = statuses[p] ?? (p === '/functions/v1/health' && !init.headers.Authorization ? 401 : 200);
      return { status, json: async () => (p === '/functions/v1/health' ? { ok: true } : []) };
    };
    return { fn, calls };
  };

  it.each([
    ['http scheme', { TERMINALQUEST_SUPABASE_URL: `http://${REF}.supabase.co` }],
    ['host mismatch', { TERMINALQUEST_SUPABASE_URL: `https://${OTHER_REF}.supabase.co` }],
    ['non-supabase host', { TERMINALQUEST_SUPABASE_URL: 'https://example.com' }],
    ['missing key', { TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY: '' }],
  ])('rejects %s before any request', async (_n, over) => {
    const { fn, calls } = mockFetch();
    await expect(verify(vEnv(over), { fetch: fn, log: () => {} })).rejects.toThrow(VerifyError);
    expect(calls).toEqual([]);
  });

  it('passes when statuses match and sends only reads', async () => {
    const { fn, calls } = mockFetch();
    const logs = [];
    await verify(vEnv(), { fetch: fn, log: m => logs.push(m) });
    expect(calls.map(c => c.method)).toEqual(['GET', 'GET', 'GET', 'POST']);
    expect(calls.every(c => !/\/(signup|token)/.test(c.url))).toBe(true);
    expect(logs.join('\n')).not.toContain('SENTINEL-PUBLISHABLE');
  });

  it('fails when the gateway does not enforce JWT', async () => {
    const { fn } = mockFetch({ '/functions/v1/health': 200 });
    await expect(verify(vEnv(), { fetch: fn, log: () => {} })).rejects.toThrow(VerifyError);
  });

  it('checks health with a bearer token only when provided', async () => {
    const { fn, calls } = mockFetch();
    await verify(vEnv({ TERMINALQUEST_REMOTE_CHECK_ACCESS_TOKEN: 'x' }), { fetch: fn, log: () => {} });
    expect(calls).toHaveLength(5);
    expect(resolveTarget(vEnv()).base).toBe(`https://${REF}.supabase.co`);
  });
});

describe('workflow wiring', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/supabase-deploy.yml'), 'utf8');

  it('is manual only', () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
  });

  it('gates the deploy on local verification and a GitHub Environment', () => {
    expect(workflow).toMatch(/needs: verify-local/);
    expect(workflow).toMatch(/environment: \$\{\{ inputs\.environment \}\}/);
    expect(workflow).toContain('npm run supabase:integration');
  });

  it('never skips seed protection, JWT verification or hardcodes secrets', () => {
    expect(workflow).not.toMatch(/--include-seed|--no-verify-jwt|--prune/);
    expect(workflow).not.toMatch(/sbp_[A-Za-z0-9]/);
  });

  it('exposes the deploy scripts without the supabase: local-only prefix', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(scripts['deploy:supabase']).toBe('node tasks/supabase_deploy/index.js');
    expect(scripts['deploy:supabase:verify']).toBe('node tasks/supabase_deploy/verify.js');
  });
});
