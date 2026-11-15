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
