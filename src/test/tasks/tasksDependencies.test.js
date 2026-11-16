const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const tasksDir = path.join(repoRoot, 'tasks');
const nodeBin = process.execPath;

// Runs `source` in a fresh Node process whose working directory is `cwd`, with
// a minimal environment (no real .env, no credentials)
function runNode(source, cwd, env = {}) {
  return spawnSync(nodeBin, ['-e', source], {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tq-tasks-'));
}

describe('tasks dependencies (CommonJS scripts on updated packages)', () => {
  it('resolves the packages from the root node_modules', () => {
    const resolved = require.resolve('chalk', { paths: [tasksDir] });
    expect(resolved.startsWith(path.join(repoRoot, 'node_modules'))).toBe(true);
  });

  it('loads every package the way the scripts do', () => {
    const result = runNode(
      `
      const assert = require('assert');
      const pug = require('pug');
      assert.strictEqual(typeof pug.render, 'function');
      assert.strictEqual(typeof require('cheerio').load, 'function');
      assert.strictEqual(typeof require('chalk').default.blue.bold, 'function');
      assert.strictEqual(typeof require('through2').default.obj, 'function');
      assert.strictEqual(typeof require('klaw'), 'function');
      assert.strictEqual(typeof require('command-line-args'), 'function');
      assert.strictEqual(typeof require('date-fns').format, 'function');
      assert.strictEqual(typeof require('date-fns').formatRelative, 'function');
      assert.strictEqual(typeof require('firebase-admin/app').initializeApp, 'function');
      assert.strictEqual(typeof require('firebase-admin/app').cert, 'function');
      assert.strictEqual(typeof require('firebase-admin/firestore').getFirestore, 'function');
      assert.strictEqual(typeof require('@aws-sdk/client-polly').PollyClient, 'function');
      assert.strictEqual(
        typeof require('@aws-sdk/client-polly').SynthesizeSpeechCommand,
        'function'
      );
      import('@actions/core').then(core => {
        assert.strictEqual(typeof core.setFailed, 'function');
      });
      `,
      tasksDir
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('keeps the date format used by the changelog', () => {
    const result = runNode(
      `process.stdout.write(require('date-fns').format(new Date(2026, 10, 17), 'MMMM, do y'))`,
      tasksDir
    );

    expect(result.stdout).toBe('November, 17th 2026');
  });

  it('through2.obj streams objects', () => {
    const result = runNode(
      `
      const through2 = require('through2').default;
      const items = [];
      const stream = through2.obj(function (item, enc, next) {
        this.push(item.n * 2);
        next();
      });
      stream.on('data', value => items.push(value)).on('end', () => {
        process.stdout.write(items.join(','));
      });
      stream.write({ n: 1 });
      stream.write({ n: 2 });
      stream.end();
      `,
      tasksDir
    );

    expect(result.stdout).toBe('2,4');
  });
});

describe('tasks/utils/withActionsErrorReporting', () => {
  it('reports a failure through @actions/core and exits non-zero', () => {
    const helper = path.join(tasksDir, 'utils', 'withActionsErrorReporting.js');
    const result = runNode(
      `require(${JSON.stringify(
        helper
      )})(async () => { throw new Error('boom'); })();`,
      makeTempDir()
    );

    expect(result.stdout).toContain('::error::boom');
    expect(result.status).toBe(1);
  });
});

describe('tasks/shared/firebase', () => {
  it('fails with the names of the missing variables, without reading a real .env', () => {
    const firebase = path.join(tasksDir, 'shared', 'firebase.js');
    const result = runNode(
      `require(${JSON.stringify(firebase)});`,
      makeTempDir()
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('FIREBASE_ADMIN_SA_JSON');
    expect(result.stderr).toContain('FIREBASE_DATABASE_URL');
  });

  it('only names the variable that is missing', () => {
    const firebase = path.join(tasksDir, 'shared', 'firebase.js');
    const result = runNode(
      `require(${JSON.stringify(firebase)});`,
      makeTempDir(),
      { FIREBASE_DATABASE_URL: 'https://example.invalid' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('FIREBASE_ADMIN_SA_JSON');
    expect(result.stderr).not.toContain(
      'Missing environment variables: FIREBASE_ADMIN_SA_JSON, FIREBASE_DATABASE_URL'
    );
  });
});
