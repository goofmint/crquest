const mocks = vi.hoisted(() => ({
  copyFile: vi.fn(),
  lstat: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => mocks);

import * as fs from '../../../../js/app/platform/tauri/fs';

const info = (kind, extra = {}) => ({
  isFile: kind === 'file',
  isDirectory: kind === 'dir',
  isSymlink: kind === 'symlink',
  size: 5,
  mtime: new Date('2020-01-02T03:04:05.000Z'),
  ...extra,
});

// A tiny in-memory file system behind the plugin mocks.
function useVirtualFs(files = {}, dirs = ['/']) {
  const fileMap = new Map(Object.entries(files));
  const dirSet = new Set(dirs);
  const isThere = p => fileMap.has(p) || dirSet.has(p);
  mocks.lstat.mockImplementation(async p => {
    if (fileMap.has(p)) return info('file');
    if (dirSet.has(p)) return info('dir');
    throw 'No such file or directory (os error 2)';
  });
  mocks.stat.mockImplementation(async p => {
    if (fileMap.has(p)) return info('file');
    if (dirSet.has(p)) return info('dir');
    throw 'No such file or directory (os error 2)';
  });
  mocks.readTextFile.mockImplementation(async p => {
    if (!fileMap.has(p)) throw 'No such file or directory (os error 2)';
    return fileMap.get(p);
  });
  mocks.readDir.mockImplementation(async p => {
    if (!dirSet.has(p)) throw 'No such file or directory (os error 2)';
    const prefix = p.endsWith('/') ? p : `${p}/`;
    const names = new Set();
    [...fileMap.keys(), ...dirSet].forEach(k => {
      if (k !== p && k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0]);
    });
    return [...names].map(name => ({ name }));
  });
  mocks.mkdir.mockImplementation(async p => void dirSet.add(p));
  mocks.writeTextFile.mockImplementation(async (p, c) => void fileMap.set(p, c));
  mocks.writeFile.mockImplementation(async (p, c) => void fileMap.set(p, c));
  mocks.copyFile.mockImplementation(async (a, b) => void fileMap.set(b, fileMap.get(a)));
  mocks.remove.mockImplementation(async p => {
    [...fileMap.keys()].filter(k => k === p || k.startsWith(`${p}/`)).forEach(k => fileMap.delete(k));
    [...dirSet].filter(k => k === p || k.startsWith(`${p}/`)).forEach(k => dirSet.delete(k));
  });
  return { fileMap, dirSet };
}

beforeEach(() => Object.values(mocks).forEach(m => m.mockReset()));

describe('Node fs.promises family', () => {
  test('readFile with utf8 returns text; without encoding returns bytes', async () => {
    mocks.readTextFile.mockResolvedValue('hello');
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2]));
    await expect(fs.readFile('/a', 'utf8')).resolves.toBe('hello');
    await expect(fs.readFile('/a', { encoding: 'utf-8' })).resolves.toBe('hello');
    await expect(fs.readFile('/a')).resolves.toEqual(new Uint8Array([1, 2]));
  });

  test('readFile rejects an unsupported encoding explicitly', async () => {
    await expect(fs.readFile('/a', 'latin1')).rejects.toThrow(/Unsupported encoding/);
    expect(mocks.readTextFile).not.toHaveBeenCalled();
  });

  test('a missing file rejects with ENOENT', async () => {
    mocks.readTextFile.mockRejectedValue('No such file or directory (os error 2)');
    await expect(fs.readFile('/missing', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('a forbidden path rejects without an ENOENT code', async () => {
    mocks.readTextFile.mockRejectedValue('forbidden path: /etc/passwd, maybe it is not allowed');
    const error = await fs.readFile('/etc/passwd', 'utf8').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBeUndefined();
  });

  test('readdir resolves names; rejects ENOENT', async () => {
    mocks.readDir.mockResolvedValueOnce([{ name: 'a' }, { name: 'b' }]);
    await expect(fs.readdir('/d')).resolves.toEqual(['a', 'b']);
    mocks.readDir.mockRejectedValueOnce('No such file or directory (os error 2)');
    await expect(fs.readdir('/x')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('stat and lstat return a Stats-like object', async () => {
    mocks.stat.mockResolvedValue(info('file'));
    mocks.lstat.mockResolvedValue(info('symlink'));
    const s = await fs.stat('/f');
    expect(s.isFile()).toBe(true);
    expect(s.isDirectory()).toBe(false);
    expect(s.size).toBe(5);
    expect(s.mtimeMs).toBe(new Date('2020-01-02T03:04:05.000Z').getTime());
    expect((await fs.lstat('/l')).isSymbolicLink()).toBe(true);
  });

  test('stat rejects ENOENT', async () => {
    mocks.stat.mockRejectedValue('No such file or directory (os error 2)');
    await expect(fs.stat('/m')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects a non-string path before calling the plugin', async () => {
    await expect(fs.readFile(undefined, 'utf8')).rejects.toBeInstanceOf(TypeError);
    await expect(fs.stat('')).rejects.toBeInstanceOf(TypeError);
    expect(mocks.stat).not.toHaveBeenCalled();
  });
});

describe('jetpack family', () => {
  test('existsAsync: false / dir / file / other', async () => {
    mocks.stat.mockRejectedValueOnce('No such file or directory (os error 2)');
    await expect(fs.existsAsync('/n')).resolves.toBe(false);
    mocks.stat.mockResolvedValueOnce(info('dir'));
    await expect(fs.existsAsync('/d')).resolves.toBe('dir');
    mocks.stat.mockResolvedValueOnce(info('file'));
    await expect(fs.existsAsync('/f')).resolves.toBe('file');
    mocks.stat.mockResolvedValueOnce(info('other'));
    await expect(fs.existsAsync('/o')).resolves.toBe('other');
  });

  test('only ENOENT means missing: other errors propagate from every function', async () => {
    const denied = 'Permission denied (os error 13)';
    mocks.stat.mockRejectedValue(denied);
    mocks.lstat.mockRejectedValue(denied);
    await expect(fs.existsAsync('/p')).rejects.toThrow('Permission denied');
    await expect(fs.listAsync('/p')).rejects.toThrow('Permission denied');
    await expect(fs.removeAsync('/p')).rejects.toThrow('Permission denied');
    mocks.readTextFile.mockRejectedValue(denied);
    mocks.readFile.mockRejectedValue(denied);
    await expect(fs.readAsync('/p')).rejects.toThrow('Permission denied');
    await expect(fs.readAsync('/p', 'buffer')).rejects.toThrow('Permission denied');
    await expect(fs.readAsync('/p', 'json')).rejects.toThrow('Permission denied');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  test('readAsync: a file that disappears (ENOENT from the read) is undefined', async () => {
    mocks.readTextFile.mockRejectedValue('No such file or directory (os error 2)');
    await expect(fs.readAsync('/gone')).resolves.toBeUndefined();
    mocks.readFile.mockRejectedValue('No such file or directory (os error 2)');
    await expect(fs.readAsync('/gone', 'buffer')).resolves.toBeUndefined();
  });

  test('listAsync maps a plugin "Not a directory" failure to ENOTDIR', async () => {
    mocks.stat.mockResolvedValue(info('dir'));
    mocks.readDir.mockRejectedValue('Not a directory (os error 20)');
    await expect(fs.listAsync('/x')).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  test('listAsync: undefined when missing, names for a directory, ENOTDIR for a file', async () => {
    useVirtualFs({ '/d/a.txt': 'x', '/f': 'y' }, ['/', '/d']);
    await expect(fs.listAsync('/nope')).resolves.toBeUndefined();
    await expect(fs.listAsync('/d')).resolves.toEqual(['a.txt']);
    await expect(fs.listAsync('/f')).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(fs.listAsync()).rejects.toBeInstanceOf(TypeError);
  });

  test('readAsync: undefined when missing; utf8, json, jsonWithDates, buffer', async () => {
    useVirtualFs({ '/t': 'text', '/j': '{"a":1,"d":"2020-01-02T03:04:05.000Z"}', '/bad': '{' });
    mocks.readFile.mockResolvedValue(new Uint8Array([9]));
    await expect(fs.readAsync('/nope')).resolves.toBeUndefined();
    await expect(fs.readAsync('/t')).resolves.toBe('text');
    await expect(fs.readAsync('/j', 'json')).resolves.toEqual({ a: 1, d: '2020-01-02T03:04:05.000Z' });
    const withDates = await fs.readAsync('/j', 'jsonWithDates');
    expect(withDates.d).toEqual(new Date('2020-01-02T03:04:05.000Z'));
    await expect(fs.readAsync('/t', 'buffer')).resolves.toEqual(new Uint8Array([9]));
    await expect(fs.readAsync('/bad', 'json')).rejects.toThrow(/JSON parsing failed while reading \/bad/);
    await expect(fs.readAsync('/t', 'nope')).rejects.toThrow(/Unknown return type/);
  });

  test('writeAsync creates the parent directory, writes strings, bytes and objects', async () => {
    const { fileMap, dirSet } = useVirtualFs();
    await fs.writeAsync('/a/b/c.txt', 'hi');
    expect(dirSet.has('/a/b')).toBe(true);
    expect(mocks.mkdir).toHaveBeenCalledWith('/a/b', { recursive: true });
    expect(fileMap.get('/a/b/c.txt')).toBe('hi');
    await fs.writeAsync('/a/o.json', { k: 1 });
    expect(fileMap.get('/a/o.json')).toBe(JSON.stringify({ k: 1 }, null, 2));
    const bytes = new Uint8Array([1, 2]);
    await fs.writeAsync('/a/bin', bytes);
    expect(mocks.writeFile).toHaveBeenCalledWith('/a/bin', bytes);
    await expect(fs.writeAsync('/a/x', 5)).rejects.toBeInstanceOf(TypeError);
  });

  test('copyAsync copies a file, refuses an existing target, honors overwrite, rejects a missing source', async () => {
    const { fileMap } = useVirtualFs({ '/s': 'data', '/t': 'old' });
    await expect(fs.copyAsync('/nope', '/x')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.copyAsync('/s', '/t')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(mocks.copyFile).not.toHaveBeenCalled();
    await fs.copyAsync('/s', '/t', { overwrite: true });
    expect(fileMap.get('/t')).toBe('data');
    await fs.copyAsync('/s', '/new');
    expect(fileMap.get('/new')).toBe('data');
  });

  test('copyAsync copies a directory recursively', async () => {
    const { fileMap } = useVirtualFs({ '/src/a': '1', '/src/sub/b': '2' }, ['/', '/src', '/src/sub']);
    await fs.copyAsync('/src', '/dst');
    expect(fileMap.get('/dst/a')).toBe('1');
    expect(fileMap.get('/dst/sub/b')).toBe('2');
  });

  test('copyAsync: an existing destination directory is refused without overwrite, with no mutation', async () => {
    const { fileMap } = useVirtualFs({ '/src/a': '1', '/dst/old': 'x' }, ['/', '/src', '/dst']);
    await expect(fs.copyAsync('/src', '/dst')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.copyFile).not.toHaveBeenCalled();
    await fs.copyAsync('/src', '/dst', { overwrite: true });
    expect(fileMap.get('/dst/a')).toBe('1');
    expect(fileMap.get('/dst/old')).toBe('x');
  });

  test.each([
    ['/src', '/src'],
    ['/src', '/src/'],
    ['/src', '/src/inner'],
    ['/src', '/src/inner/deeper'],
    ['/src/', '/src/../src/x'],
    ['C:\\Src', 'c:\\src\\inner'],
  ])('copyAsync rejects %s -> %s before touching anything', async (from, to) => {
    useVirtualFs({}, ['/', '/src']);
    await expect(fs.copyAsync(from, to, { overwrite: true })).rejects.toThrow(/onto itself or into itself/);
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.copyFile).not.toHaveBeenCalled();
    expect(mocks.stat).not.toHaveBeenCalled();
  });

  test('copyAsync allows a sibling whose name starts with the source name', async () => {
    const { fileMap } = useVirtualFs({ '/src/a': '1' }, ['/', '/src']);
    await fs.copyAsync('/src', '/src2');
    expect(fileMap.get('/src2/a')).toBe('1');
  });

  test('removeAsync: no-op for a missing path, recursive otherwise', async () => {
    const { fileMap } = useVirtualFs({ '/d/f': 'x' }, ['/', '/d']);
    await expect(fs.removeAsync('/nope')).resolves.toBeUndefined();
    expect(mocks.remove).not.toHaveBeenCalled();
    await fs.removeAsync('/d');
    expect(mocks.remove).toHaveBeenCalledWith('/d', { recursive: true });
    expect(fileMap.size).toBe(0);
  });
});

describe('synchronous members', () => {
  test.each(['exists', 'list', 'read', 'remove', 'readFileSync'])('%s throws explicitly', name => {
    expect(() => fs[name]('/a')).toThrow(/not available on Tauri/);
    expect(() => fs[name]('/a')).toThrow(expect.objectContaining({ code: 'ERR_TAURI_SYNC_UNSUPPORTED' }));
  });
});
