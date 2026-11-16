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
import { stageTauriFrontend } from '../../../../../tasks/stage_tauri_frontend';

const bootstrap = path.join(repoRoot, 'src/test/utils/tauriBootBootstrap.mjs');

function runBootstrap(outputDir, scenario = '', stagedDir = outputDir) {
  return new Promise((resolve, reject) => {
    const child = fork(bootstrap, [outputDir, scenario, stagedDir], {
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
  let stagedDir;

  beforeAll(async () => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminalquest-tauri-boot-'));
    await build({
      configFile: path.join(repoRoot, 'vite.config.mjs'),
      mode: 'tauri',
      logLevel: 'silent',
      build: { outDir: outputDir, emptyOutDir: true },
    });
    // The Tauri frontendDist (W12): public/ without content/, levels/ and
    // node_modules (tasks/stage_tauri_frontend.js) plus this build's output
    stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminalquest-tauri-dist-'));
    stageTauriFrontend(path.join(repoRoot, 'public'), stagedDir);
    fs.cpSync(outputDir, stagedDir, { recursive: true });
  }, 180000);

  afterAll(() => {
    // vite.config.mjs sets NODE_ENV=production while it is loaded
    process.env.NODE_ENV = originalNodeEnv;
    if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
    if (stagedDir) fs.rmSync(stagedDir, { recursive: true, force: true });
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

  it('the staged frontendDist serves every file the page and its styles link', () => {
    // index.html: link href / script src; each must be a file of the staging
    // directory (the webview requests them from the embedded frontendDist)
    const html = fs.readFileSync(path.join(stagedDir, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/<(?:link|script|img|source)\b[^>]*?\b(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    expect(urls.length).toBeGreaterThan(8);
    urls.forEach(url => {
      expect(url).not.toMatch(/^(?:[a-z]+:|\/)/);
      expect(fs.existsSync(path.join(stagedDir, url)), url).toBe(true);
    });
    // css url(...) of the styles that index.html links (relative to the stylesheet)
    const styles = urls.filter(url => url.endsWith('.css'));
    styles.forEach(style => {
      const css = fs.readFileSync(path.join(stagedDir, style), 'utf8');
      [...css.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)]
        .map(m => m[1].split(/[?#]/)[0])
        .filter(url => !/^(?:[a-z]+:|\/)/i.test(url))
        .forEach(url => {
          expect(fs.existsSync(path.join(stagedDir, path.dirname(style), url)), `${style}: ${url}`).toBe(true);
        });
    });
    // what the Tauri build reads as resources, or bundles, is not embedded
    ['content', 'levels', 'node_modules/pug', 'package.json', 'package-lock.json'].forEach(name => {
      expect(fs.existsSync(path.join(stagedDir, name)), name).toBe(false);
    });
    // the worker script and the page-shipped avatars are
    ['code_runner/worker.js', 'avatars/avatar1.png', 'avatars/parts/body.png'].forEach(name => {
      expect(fs.existsSync(path.join(stagedDir, name)), name).toBe(true);
    });
    const hidden = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      if (entry.name.startsWith('.')) hidden.push(path.join(dir, entry.name));
      else if (entry.isDirectory()) walk(path.join(dir, entry.name));
    });
    walk(stagedDir);
    expect(hidden).toEqual([]);
  });

  it('replaces the loading screen with the title screen on a fresh state', async () => {
    const result = await runBootstrap(outputDir, '', stagedDir);
    expect(result.fatal).toBeUndefined();
    expect(result.leaked).toEqual([]);
    expect(result.startError, JSON.stringify(result.logs, null, 2)).toBeNull();
    expect(result.failures, JSON.stringify(result.logs, null, 2)).toEqual([]);
    expect(result.loading, JSON.stringify(result, null, 2)).toBe(false);
    expect(result.title, JSON.stringify(result, null, 2)).toBe(true);
    // The complete record of console.error, not the tail kept for diagnosis
    expect(result.errors).toEqual([]);
    // The Help menu is enabled only after its listener is installed (#141)
    const listen = result.ipcCalls.indexOf('plugin:event|listen');
    const enable = result.ipcCalls.indexOf('enable_help_menu');
    expect(listen).toBeGreaterThanOrEqual(0);
    expect(enable).toBeGreaterThan(listen);
  }, 60000);

  it('detects a console.error that is followed by more than 40 other logs', async () => {
    const result = await runBootstrap(outputDir, 'early-error', stagedDir);
    expect(result.errors).toEqual(['early error']);
    expect(result.logs).toHaveLength(40);
    expect(result.logs.some(([level]) => level === 'error')).toBe(false);
  }, 60000);
});
