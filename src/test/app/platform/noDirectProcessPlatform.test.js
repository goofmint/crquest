import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Application code outside the platform layer must ask platform/env for the
// OS: the Tauri build has no `process.platform`.
const APP_ROOT = join(__dirname, '../../../js/app');
const PLATFORM_DIR = join(APP_ROOT, 'platform');

function listSources(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(js|jsx)$/.test(name) ? [full] : [];
  });
}

test('no application code outside platform/ reads process.platform or imports from "process"', () => {
  const offenders = listSources(APP_ROOT)
    .filter(file => !file.startsWith(PLATFORM_DIR + sep))
    .filter(file => {
      const source = readFileSync(file, 'utf8');
      return /process\.platform|from ['"]process['"]/.test(source);
    })
    .map(file => relative(APP_ROOT, file));
  expect(offenders).toEqual([]);
});
