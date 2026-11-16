import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fs from '../../../js/app/platform/fs';

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures');
const FIXTURE_DIR = path.join(FIXTURES, 'platform');
const FIXTURE_JSON = path.join(FIXTURE_DIR, 'with-version.json');
const MISSING = path.join(FIXTURES, 'does-not-exist');

describe('jetpack family (missing path is a normal value)', () => {
  test('existsAsync returns file / dir / false', async () => {
    expect(await fs.existsAsync(FIXTURE_JSON)).toBe('file');
    expect(await fs.existsAsync(FIXTURE_DIR)).toBe('dir');
    expect(await fs.existsAsync(MISSING)).toBe(false);
  });

  test('listAsync returns the same order as a plain readdir', async () => {
    expect(await fs.listAsync(FIXTURE_DIR)).toEqual(await fs.readdir(FIXTURE_DIR));
  });

  test('listAsync returns names, and undefined for a missing directory', async () => {
    expect(await fs.listAsync(FIXTURE_DIR)).toEqual(
      expect.arrayContaining(['with-version.json'])
    );
    expect(await fs.listAsync(MISSING)).toBeUndefined();
  });

  test('readAsync returns a string by default and undefined if missing', async () => {
    expect(typeof (await fs.readAsync(FIXTURE_JSON))).toBe('string');
    expect(await fs.readAsync(MISSING)).toBeUndefined();
  });
});

describe('no synchronous members', () => {
  test.each(['exists', 'list', 'read', 'remove', 'readFileSync'])('%s is not exported', name => {
    expect(fs[name]).toBeUndefined();
  });

  test('readFile with utf8 rejects with ENOENT for a missing file', async () => {
    await expect(fs.readFile(MISSING, { encoding: 'utf8' })).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('Node fs.promises family (missing path rejects)', () => {
  test('readFile returns a Buffer without options and a string with utf8', async () => {
    expect(Buffer.isBuffer(await fs.readFile(FIXTURE_JSON))).toBe(true);
    const text = await fs.readFile(FIXTURE_JSON, { encoding: 'utf8' });
    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual(await fs.readAsync(FIXTURE_JSON, 'json'));
  });

  test('stat resolves a Stats object for an existing path', async () => {
    const stats = await fs.stat(FIXTURE_JSON);
    expect(stats.isFile()).toBe(true);
  });

  test('lstat resolves a Stats object and rejects with ENOENT for a missing path', async () => {
    expect((await fs.lstat(FIXTURE_JSON)).isFile()).toBe(true);
    await expect(fs.lstat(MISSING)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('stat, readFile and readdir reject with ENOENT for a missing path', async () => {
    await expect(fs.stat(MISSING)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(MISSING)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.readdir(MISSING)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('readdir resolves entry names', async () => {
    expect(await fs.readdir(FIXTURE_DIR)).toEqual(
      expect.arrayContaining(['with-version.json'])
    );
  });
});

describe('jetpack write / copy / remove (async)', () => {
  let dir;
  beforeEach(() => {
    dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'crq-fs-'));
  });
  afterEach(() => {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  });

  test('writeAsync creates missing parent directories and writes a string', async () => {
    const file = path.join(dir, 'a', 'b', 'c.txt');
    await fs.writeAsync(file, 'hello');
    expect(nodeFs.readFileSync(file, 'utf8')).toBe('hello');
  });

  test('writeAsync serializes an object as JSON', async () => {
    const file = path.join(dir, 'data.json');
    await fs.writeAsync(file, { a: 1 });
    expect(JSON.parse(nodeFs.readFileSync(file, 'utf8'))).toEqual({ a: 1 });
  });

  test('copyAsync copies a file and rejects for an existing target unless overwrite is set', async () => {
    const from = path.join(dir, 'from.txt');
    const to = path.join(dir, 'to.txt');
    nodeFs.writeFileSync(from, 'new');
    nodeFs.writeFileSync(to, 'old');
    await expect(fs.copyAsync(from, to)).rejects.toThrow();
    expect(nodeFs.readFileSync(to, 'utf8')).toBe('old');
    await fs.copyAsync(from, to, { overwrite: true });
    expect(nodeFs.readFileSync(to, 'utf8')).toBe('new');
  });

  test('copyAsync of a missing source rejects with ENOENT', async () => {
    await expect(
      fs.copyAsync(path.join(dir, 'nope'), path.join(dir, 'to'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('removeAsync deletes a directory tree and a missing path is a no-op', async () => {
    nodeFs.mkdirSync(path.join(dir, 'sub'));
    nodeFs.writeFileSync(path.join(dir, 'sub', 'f.txt'), 'x');
    await fs.removeAsync(path.join(dir, 'sub'));
    expect(nodeFs.existsSync(path.join(dir, 'sub'))).toBe(false);
    await expect(fs.removeAsync(path.join(dir, 'sub'))).resolves.toBeUndefined();
  });
});

