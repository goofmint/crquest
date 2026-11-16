import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_EXTENSION_VENDORED_DIRECTORY } from '../../../../js/app/common/extensions';
import vendoredExtensionModules from '../../../../js/app/config/vendoredExtensionModules.json';

vi.mock('../../../../js/app/common/context');
vi.mock('../../../../js/app/common/fs_utils');
vi.mock('../../../../js/app/config/config');

// Drift check for docs/migration/tauri-resources.md: every entry of
// tauri.conf.json `bundle.resources` must exist in the repository, and must
// land at the same path relative to the resource directory that
// `staticFilePath()` gives it relative to public/ (Electron).
const ROOT = path.resolve(__dirname, '../../../../..');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const PUBLIC_DIR = path.join(ROOT, 'public');
const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf8'));
const resources = conf.bundle.resources;
const entries = Object.entries(resources);

describe('tauri.conf.json bundle.resources', () => {
  test('is a source -> destination map (the list form would nest under _up_)', () => {
    expect(Array.isArray(resources)).toBe(false);
    expect(entries.length).toBeGreaterThan(0);
  });

  test.each(entries)('%s -> %s: the source directory exists and is not empty', (source) => {
    expect(source.endsWith('/')).toBe(true);
    const absolute = path.resolve(TAURI_DIR, source);
    expect(fs.statSync(absolute).isDirectory()).toBe(true);
    expect(fs.readdirSync(absolute).length).toBeGreaterThan(0);
  });

  test.each(entries)('%s -> %s: the destination mirrors the path under public/', (source, destination) => {
    const relativeToPublic = path.relative(PUBLIC_DIR, path.resolve(TAURI_DIR, source));
    expect(relativeToPublic.startsWith('..')).toBe(false);
    expect(`${relativeToPublic.split(path.sep).join('/')}/`).toBe(destination);
  });

  test('destinations do not overlap', () => {
    const destinations = entries.map(([, destination]) => destination);
    destinations.forEach((a) => {
      destinations.forEach((b) => {
        if (a !== b) expect(b.startsWith(a)).toBe(false);
      });
    });
    expect(new Set(destinations).size).toBe(destinations.length);
  });

  const destinations = entries.map(([, destination]) => destination);
  const bundled = (relativePath) =>
    destinations.some((destination) => `${relativePath}/`.startsWith(destination));

  test('ships the vendored content packages (extensions.js reads them from content/)', () => {
    expect(bundled(BUNDLED_EXTENSION_VENDORED_DIRECTORY)).toBe(true);
    vendoredExtensionModules.forEach((name) => {
      expect(fs.existsSync(path.join(PUBLIC_DIR, BUNDLED_EXTENSION_VENDORED_DIRECTORY, name, 'package.json'))).toBe(true);
    });
  });

  test('ships what the game reads from disk: levels/ and the avatar parts', () => {
    ['levels', 'levels/common/music', 'levels/common/sfx', 'levels/common/entities', 'avatars/parts'].forEach(
      (relativePath) => {
        expect(bundled(relativePath)).toBe(true);
        expect(fs.existsSync(path.join(PUBLIC_DIR, relativePath))).toBe(true);
      }
    );
  });

  test('every avatar part avatarRenderer reads exists', () => {
    ['body', 'face', 'onesie', 'eyes', 'glasses'].forEach((part) => {
      expect(fs.existsSync(path.join(PUBLIC_DIR, 'avatars/parts', `${part}.png`))).toBe(true);
    });
  });

  test('does not ship dev-only or web-served directories', () => {
    ['node_modules', 'lib', 'images', 'fonts', 'movies', 'code_runner'].forEach((relativePath) => {
      expect(bundled(relativePath)).toBe(false);
    });
  });
});

// W12: frontendDist is the staging directory, which leaves out what is shipped
// as resources (tasks/stage_tauri_frontend.js, tauriResourceOnlyDirectories.json)
describe('tauri.conf.json frontendDist (staging directory)', () => {
  const resourceOnly = require('../../../../js/app/config/tauriResourceOnlyDirectories.json');
  const { stagingDir, RUNTIME_NODE_MODULES_FILES } = require('../../../../../tasks/stage_tauri_frontend');
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');

  test('is the directory that tasks/stage_tauri_frontend.js writes', () => {
    expect(path.resolve(TAURI_DIR, conf.build.frontendDist)).toBe(stagingDir);
  });

  test('the Tauri build commands stage it after building', () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
    expect(scripts['build:tauri']).toMatch(/--serial stage:tauri$/);
    expect(scripts['stage:tauri']).toBe('node tasks/stage_tauri_frontend.js');
    expect(conf.build.beforeBuildCommand).toBe('npm run build:tauri');
    expect(conf.build.beforeDevCommand.script).toBe('npm run build:tauri');
  });

  test('every directory left out of it is a resource (the asset protocol serves it)', () => {
    resourceOnly.forEach((name) => {
      expect(entries.some(([, destination]) => destination === `${name}/`)).toBe(true);
    });
  });

  test('the staging directory is git-ignored', () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('git', ['check-ignore', '-q', 'tauri-dist/probe.js'], { cwd: ROOT });
    expect(result.status).toBe(0);
  });

  test('the node_modules files it keeps are exactly those that index.html links', () => {
    const linked = [...html.matchAll(/(?:href|src)="(node_modules\/[^"]+)"/g)].map((m) => m[1]);
    expect(linked).toEqual(RUNTIME_NODE_MODULES_FILES);
  });

  test('index.html has no inline script or style (Tauri would add a nonce, which disables unsafe-inline)', () => {
    expect(html.toLowerCase()).not.toContain('<style');
    html.toLowerCase().split('<script').slice(1).forEach((script) => {
      expect(script.slice(0, script.indexOf('>'))).toContain(' src=');
    });
  });
});
