// platform/paths for the Vitest run (see vitest.config.mjs): directories below
// the temporary directory, the version of the test process. Test files that
// need other values mock this module.
import os from 'node:os';
import path from 'node:path';
import { promises as nodeFs } from 'node:fs';
import { staticFilePath } from '../../js/app/common/fs_utils';

const TEST_ROOT = path.join(os.tmpdir(), 'terminalquest-test');

export function getAppDataPath() {
  return path.join(TEST_ROOT, 'appData');
}

export function getUserDataPath() {
  return path.join(TEST_ROOT, 'userData');
}

export function getResourceDirPath() {
  return staticFilePath('.');
}

export function getAppVersion() {
  return '0.0.0-test';
}

export async function getGamePackageVersion() {
  const packageJsonPath = staticFilePath('package.json');
  const { version } = JSON.parse(await nodeFs.readFile(packageJsonPath, 'utf8'));
  return version;
}
