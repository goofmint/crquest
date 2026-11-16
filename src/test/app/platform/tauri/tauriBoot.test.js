// The Tauri build must reach the title screen (#154). The real split ES modules
// of `vite build --mode tauri` (index.js + tauri-game.js) are linked and
// evaluated in a jsdom window context without Node globals, with the Tauri IPC
// mocked at its boundary, on a fresh state (empty store, empty save).
// vm.SourceTextModule needs `--experimental-vm-modules`, so the harness runs in
// a forked child process (src/test/utils/tauriBootBootstrap.mjs) and reports
// the page state back over IPC. See docs/migration/tauri-runtime.md (#154) for
// what is stubbed and what this does not cover.
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { repoRoot } from '../../../utils/conversationScenarios';

const bootstrap = path.join(repoRoot, 'src/test/utils/tauriBootBootstrap.mjs');

function runBootstrap(outputDir) {
  return new Promise((resolve, reject) => {
    const child = fork(bootstrap, [outputDir], {
      execArgv: ['--experimental-vm-modules', '--no-warnings'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let result;
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', () => {});
    child.on('message', message => { result = message; });
    child.on('error', reject);
    child.on('exit', code => {
      if (result) resolve(result);
      else reject(new Error(`boot child exited with ${code} without a result: ${stderr}`));
    });
  });
}

describe('Tauri build boot (--mode tauri) in a jsdom window without Node globals', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let outputDir;

  beforeAll(async () => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminalquest-tauri-boot-'));
    await build({
      configFile: path.join(repoRoot, 'vite.config.mjs'),
      mode: 'tauri',
      logLevel: 'silent',
      build: { outDir: outputDir, emptyOutDir: true },
    });
  }, 180000);

  afterAll(() => {
    // vite.config.mjs sets NODE_ENV=production while it is loaded
    process.env.NODE_ENV = originalNodeEnv;
    if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('produces the split modules', () => {
    expect(fs.existsSync(path.join(outputDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'tauri-game.js'))).toBe(true);
  });

  it('does not read fs.readFileSync while ejs is loaded (patched, #154)', () => {
    const game = fs.readFileSync(path.join(outputDir, 'tauri-game.js'), 'utf8');
    expect(game).not.toContain('exports.fileLoader = fs.readFileSync;');
    expect(game).toMatch(/exports\.fileLoader = function\s*\(\)\s*\{\s*return fs\.readFileSync\.apply\(fs, arguments\);/);
  });

  it('replaces the loading screen with the title screen on a fresh state', async () => {
    const result = await runBootstrap(outputDir);
    expect(result.fatal).toBeUndefined();
    expect(result.leaked).toEqual([]);
    expect(result.startError, JSON.stringify(result.logs, null, 2)).toBeNull();
    expect(result.failures, JSON.stringify(result.logs, null, 2)).toEqual([]);
    expect(result.loading, JSON.stringify(result, null, 2)).toBe(false);
    expect(result.title, JSON.stringify(result, null, 2)).toBe(true);
    const errors = result.logs.filter(([level]) => level === 'error');
    expect(errors).toEqual([]);
  }, 60000);
});
