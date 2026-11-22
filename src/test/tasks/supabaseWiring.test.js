const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const PINNED = '3.2.0';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function isIgnored(relativePath) {
  const result = spawnSync('git', ['check-ignore', '-q', '--no-index', relativePath], { cwd: repoRoot });
  return result.status === 0;
}

describe('supabase local stack wiring (no Docker required)', () => {
  it('pins the Supabase CLI exactly in package.json', () => {
    expect(readJson('package.json').devDependencies.supabase).toBe(PINNED);
  });

  it('pins the Supabase CLI in package-lock.json', () => {
    const lock = readJson('package-lock.json');
    expect(lock.packages[''].devDependencies.supabase).toBe(PINNED);
    expect(lock.packages['node_modules/supabase'].version).toBe(PINNED);
  });

  it('keeps supabase:reset local-only', () => {
    const { scripts } = readJson('package.json');
    expect(scripts['supabase:reset']).toBe('supabase db reset');
    for (const [name, command] of Object.entries(scripts)) {
      if (name.startsWith('supabase:')) {
        expect(command).not.toMatch(/--(remote|linked|db-url)/);
      }
    }
  });

  it.each([
    '.env.supabase.local',
    'supabase/.temp/cli-latest',
    'supabase/.branches/current',
    'supabase/functions/.env',
  ])('ignores local state and credentials: %s', relativePath => {
    expect(isIgnored(relativePath)).toBe(true);
  });

  it.each([
    '.env.supabase.template',
    'supabase/config.toml',
    'supabase/seed.sql',
  ])('tracks %s', relativePath => {
    expect(isIgnored(relativePath)).toBe(false);
  });

  describe('.env.supabase.template', () => {
    const lines = fs
      .readFileSync(path.join(repoRoot, '.env.supabase.template'), 'utf8')
      .split(/\r?\n/)
      .filter(line => line.trim() && !line.trim().startsWith('#'));

    it('contains variables with empty values only', () => {
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(/^[A-Z_]+=$/);
      }
    });

    it('never exposes server-only variables with the VITE_ prefix', () => {
      for (const line of lines) {
        expect(line.startsWith('VITE_')).toBe(false);
      }
    });
  });

  it('enables JWT verification for the health function', () => {
    const config = fs.readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
    expect(config).toMatch(/\[functions\.health\][^[]*verify_jwt = true/);
  });

  describe('auth (docs/supabase/auth.md)', () => {
    const config = () => fs.readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8').replace(/\r\n/g, '\n');

    it('allows only the TerminalQuest callback as a redirect URL', () => {
      expect(config()).toMatch(/^additional_redirect_urls = \["terminalquest:\/\/auth\/callback\?attempt=\*"\]$/m);
    });

    it.each(['github', 'google'])('enables %s with credentials from env() only', provider => {
      const section = config().match(new RegExp(`\\[auth\\.external\\.${provider}\\]\\n([^\\[]*)`))[1];
      expect(section).toMatch(/^enabled = true$/m);
      const name = provider.toUpperCase();
      expect(section).toContain(`client_id = "env(SUPABASE_AUTH_EXTERNAL_${name}_CLIENT_ID)"`);
      expect(section).toContain(`secret = "env(SUPABASE_AUTH_EXTERNAL_${name}_SECRET)"`);
    });

    it('lists the OAuth and build-time variables in the env template, empty', () => {
      const template = fs.readFileSync(path.join(repoRoot, '.env.supabase.template'), 'utf8');
      for (const name of [
        'SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID',
        'SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET',
        'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID',
        'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET',
        'TERMINALQUEST_SUPABASE_URL',
        'TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY',
      ]) {
        expect(template).toMatch(new RegExp(`^${name}=$`, 'm'));
      }
    });
  });

  describe('mission catalog (docs/supabase/mission-catalog.md)', () => {
    it('lists the remote publish variables in the env template, empty', () => {
      const template = fs.readFileSync(path.join(repoRoot, '.env.supabase.template'), 'utf8');
      for (const name of ['TERMINALQUEST_CATALOG_SUPABASE_URL', 'TERMINALQUEST_CATALOG_SUPABASE_SECRET_KEY']) {
        expect(template).toMatch(new RegExp(`^${name}=$`, 'm'));
      }
    });

    it('points sync:missions at Supabase and keeps the Firestore version', () => {
      const { scripts } = readJson('package.json');
      expect(scripts['sync:missions']).toBe('node tasks/sync_missions/supabase.js');
      expect(scripts['sync:missions:firestore']).toBe('node tasks/sync_missions/index.js');
    });

    it('does not expose catalog_private through the API', () => {
      const config = fs.readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
      expect(config).toMatch(/^schemas = \["public", "graphql_public"\]$/m);
    });
  });
});
