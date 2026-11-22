const path = require('path');
const { spawnSync } = require('child_process');
const { resolveTarget, TargetError } = require('../../../tasks/sync_missions/target');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const SECRET = 'sb_secret_TESTONLY_do_not_log';

describe('sync:missions target resolution', () => {
  it('requires --target', () => {
    expect(() => resolveTarget([], { env: {} })).toThrow(TargetError);
    expect(() => resolveTarget(['--target', 'prod'], { env: {} })).toThrow(/local または remote/);
  });

  it('rejects a non-loopback local URL', () => {
    const readStatus = () => ({ API_URL: 'http://192.168.1.5:54321', SERVICE_ROLE_KEY: SECRET });
    expect(() => resolveTarget(['--target', 'local'], { readStatus })).toThrow(/ループバック/);
  });

  it('accepts a loopback local URL', () => {
    const readStatus = () => ({ API_URL: 'http://127.0.0.1:54321/', SERVICE_ROLE_KEY: SECRET });
    expect(resolveTarget(['--target=local'], { readStatus })).toEqual({
      name: 'local',
      url: 'http://127.0.0.1:54321',
      key: SECRET,
    });
  });

  it('rejects an http remote URL without echoing the key', () => {
    const env = {
      TERMINALQUEST_CATALOG_SUPABASE_URL: 'http://example.test',
      TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY: SECRET,
    };
    let message = '';
    try {
      resolveTarget(['--target', 'remote'], { env });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/https/);
    expect(message).not.toContain(SECRET);
  });

  it('fails when remote variables are missing', () => {
    expect(() => resolveTarget(['--target', 'remote'], { env: {} })).toThrow(
      /TERMINALQUEST_CATALOG_SUPABASE_URL, TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY/
    );
  });

  it('accepts an https remote URL', () => {
    const env = {
      TERMINALQUEST_CATALOG_SUPABASE_URL: 'https://abc.supabase.co',
      TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY: SECRET,
    };
    expect(resolveTarget(['--target', 'remote'], { env }).url).toBe('https://abc.supabase.co');
  });
});

describe('sync:missions CLI (child process)', () => {
  const run = (args, env = {}) =>
    spawnSync(process.execPath, ['tasks/sync_missions/supabase.js', ...args], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    });

  it('exits 1 without --target', () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--target/);
  });

  it('exits 1 for an http remote and does not print the key', () => {
    const result = run(['--target', 'remote'], {
      TERMINALQUEST_CATALOG_SUPABASE_URL: 'http://example.test',
      TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY: SECRET,
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(SECRET);
  });
});
