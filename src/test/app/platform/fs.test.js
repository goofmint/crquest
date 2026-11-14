const path = require('path');
const fs = require('../../../js/app/platform/fs');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures');
const FIXTURE_DIR = path.join(FIXTURES, 'platform');
const FIXTURE_JSON = path.join(FIXTURE_DIR, 'with-version.json');
const MISSING = path.join(FIXTURES, 'does-not-exist');

describe('jetpack family (missing path is a normal value)', () => {
  test('exists returns file / dir / false', () => {
    expect(fs.exists(FIXTURE_JSON)).toBe('file');
    expect(fs.exists(FIXTURE_DIR)).toBe('dir');
    expect(fs.exists(MISSING)).toBe(false);
  });

  test('existsAsync returns file / dir / false', async () => {
    expect(await fs.existsAsync(FIXTURE_JSON)).toBe('file');
    expect(await fs.existsAsync(FIXTURE_DIR)).toBe('dir');
    expect(await fs.existsAsync(MISSING)).toBe(false);
  });

  test('list returns names, and undefined for a missing directory', () => {
    expect(fs.list(FIXTURE_DIR)).toEqual(
      expect.arrayContaining(['with-version.json', 'no-version.json'])
    );
    expect(fs.list(MISSING)).toBeUndefined();
  });

  test('listAsync returns names, and undefined for a missing directory', async () => {
    expect(await fs.listAsync(FIXTURE_DIR)).toEqual(
      expect.arrayContaining(['with-version.json'])
    );
    expect(await fs.listAsync(MISSING)).toBeUndefined();
  });

  test('read returns undefined for a missing file', () => {
    expect(fs.read(MISSING)).toBeUndefined();
  });

  test('read with json parses the file', () => {
    expect(fs.read(FIXTURE_JSON, 'json')).toEqual({
      name: 'fixture',
      version: '1.2.3',
    });
  });

  test('readAsync returns a string by default and undefined if missing', async () => {
    expect(typeof (await fs.readAsync(FIXTURE_JSON))).toBe('string');
    expect(await fs.readAsync(MISSING)).toBeUndefined();
  });
});

describe('Node fs.promises family (missing path rejects)', () => {
  test('readFile returns a Buffer without options and a string with utf8', async () => {
    expect(Buffer.isBuffer(await fs.readFile(FIXTURE_JSON))).toBe(true);
    const text = await fs.readFile(FIXTURE_JSON, { encoding: 'utf8' });
    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual(fs.read(FIXTURE_JSON, 'json'));
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

describe('synchronous additions', () => {
  test('readFileSync returns a string with an encoding', () => {
    const text = fs.readFileSync(FIXTURE_JSON, { encoding: 'utf8' });
    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual(
      JSON.parse(require('fs').readFileSync(FIXTURE_JSON, 'utf8'))
    );
  });

  test('readFileSync throws ENOENT for a missing file', () => {
    expect(() => fs.readFileSync(MISSING, { encoding: 'utf8' })).toThrow(
      expect.objectContaining({ code: 'ENOENT' })
    );
  });

  test('remove (detached from jetpack) deletes a directory synchronously', () => {
    const nodeFs = require('fs');
    const dir = nodeFs.mkdtempSync(path.join(require('os').tmpdir(), 'crq-rm-'));
    nodeFs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    const { remove } = fs;
    remove(dir);
    expect(nodeFs.existsSync(dir)).toBe(false);
  });

  test('remove of a missing path is a no-op', () => {
    expect(() => fs.remove(MISSING)).not.toThrow();
  });
});
