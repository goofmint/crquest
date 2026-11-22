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
});
