const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateMapping, readItemKeys, MappingError } = require('../../../tasks/sync_unlock_codes/mapping');
const {
  publishCodes,
  parseFileArg,
  assertOutsideRepository,
  UsageError,
} = require('../../../tasks/sync_unlock_codes');
const { getBundledExtensionPaths } = require('../../../tasks/utils/bundledExtensions');
const { resolveTarget } = require('../../../tasks/sync_missions/target');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const ITEMS = new Set(['wand', 'tshirt']);
const SECRET_CODE = 'SECRET-CODE-VALUE-1';

const problemsOf = fn => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(MappingError);
    return error.problems;
  }
  throw new Error('expected a MappingError');
};

describe('validateMapping', () => {
  it('accepts {"codes": [...]} and a bare array, and keeps the order', () => {
    const entries = [
      { code: 'B', item_key: 'wand' },
      { code: 'A', item_key: 'tshirt' },
    ];
    expect(validateMapping({ codes: entries }, ITEMS)).toEqual({ codes: entries });
    expect(validateMapping(entries, ITEMS)).toEqual({ codes: entries });
  });

  it('accepts whitespace inside a code', () => {
    expect(validateMapping([{ code: 'A\u00A0B C', item_key: 'wand' }], ITEMS).codes).toHaveLength(1);
  });

  it('counts the code length in Unicode code points', () => {
    const ok = '😀'.repeat(128);
    expect(validateMapping([{ code: ok, item_key: 'wand' }], ITEMS).codes).toHaveLength(1);
    expect(problemsOf(() => validateMapping([{ code: '😀'.repeat(129), item_key: 'wand' }], ITEMS))).toHaveLength(1);
  });

  it('counts the code length in Unicode code points', () => {
    const ok = '😀'.repeat(128);
    expect(validateMapping([{ code: ok, item_key: 'wand' }], ITEMS).codes).toHaveLength(1);
    expect(problemsOf(() => validateMapping([{ code: '😀'.repeat(129), item_key: 'wand' }], ITEMS))).toHaveLength(1);
  });

  it('treats codes that differ only in case as different codes', () => {
    const entries = [
      { code: 'abc', item_key: 'wand' },
      { code: 'ABC', item_key: 'tshirt' },
    ];
    expect(validateMapping(entries, ITEMS).codes).toHaveLength(2);
  });

  it.each([null, {}, { codes: 'x' }, 'text', 5])('rejects a malformed input %j', raw => {
    expect(problemsOf(() => validateMapping(raw, ITEMS))[0]).toMatch(/配列/);
  });

  it('rejects an empty mapping', () => {
    expect(problemsOf(() => validateMapping([], ITEMS))).toEqual(['対応表が空である']);
  });

  it('rejects an item that is not in the bundled item catalog', () => {
    const problems = problemsOf(() => validateMapping([{ code: 'A', item_key: 'nope' }], ITEMS));
    expect(problems).toEqual(['#1: item_key "nope" は同梱のアイテムカタログに無い']);
  });

  it('rejects a duplicate code and a code that maps to different items', () => {
    const problems = problemsOf(() =>
      validateMapping(
        [
          { code: 'A', item_key: 'wand' },
          { code: 'A', item_key: 'wand' },
          { code: 'A', item_key: 'tshirt' },
        ],
        ITEMS
      )
    );
    expect(problems).toEqual(['#2: code が重複している (同じアイテム)', '#3: 同じ code が異なるアイテムに対応している']);
  });

  it.each([
    [{ code: '', item_key: 'wand' }],
    [{ code: ' A', item_key: 'wand' }],
    [{ code: 'A\n', item_key: 'wand' }],
    [{ code: '\u00A0A', item_key: 'wand' }],
    [{ code: 'A\u3000', item_key: 'wand' }],
    [{ code: '\uFEFFA', item_key: 'wand' }],
    [{ code: 'A\u2003', item_key: 'wand' }],
    [{ code: '\u0085A', item_key: 'wand' }],
    [{ code: 'x'.repeat(129), item_key: 'wand' }],
    [{ code: 'A' }],
    [{ code: 1, item_key: 'wand' }],
    [null],
  ])('rejects the invalid entry %j', entry => {
    expect(problemsOf(() => validateMapping([entry], ITEMS))).toHaveLength(1);
  });

  it('reports every problem at once, without echoing a code', () => {
    const entries = [
      { code: SECRET_CODE, item_key: 'nope' },
      { code: ` ${SECRET_CODE}`, item_key: 'wand' },
    ];
    try {
      validateMapping(entries, ITEMS);
      throw new Error('expected a MappingError');
    } catch (error) {
      expect(error.problems).toHaveLength(2);
      expect(error.message).not.toContain(SECRET_CODE);
    }
  });
});

describe('readItemKeys', () => {
  it('reads the item names of the bundled extensions (index.json name)', () => {
    const keys = readItemKeys(getBundledExtensionPaths());
    expect(keys.has('tshirt')).toBe(true);
    expect(keys.has('wand')).toBe(true);
    expect(keys.has('synthetic_item_not_installed')).toBe(false);
  });

  it('skips extensions without items and items without a valid index.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-items-'));
    fs.mkdirSync(path.join(dir, 'items', 'good'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'items', 'good', 'index.json'), JSON.stringify({ name: 'good' }));
    fs.mkdirSync(path.join(dir, 'items', 'broken'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'items', 'broken', 'index.json'), '{');
    fs.mkdirSync(path.join(dir, 'items', 'empty'), { recursive: true });
    expect([...readItemKeys([dir, path.join(dir, 'missing')])]).toEqual(['good']);
  });
});

describe('arguments', () => {
  it('requires --file and accepts both forms', () => {
    expect(() => parseFileArg(['--target', 'local'])).toThrow(UsageError);
    const file = path.join(os.tmpdir(), 'x', 'y.json');
    expect(parseFileArg(['--file', file])).toBe(file);
    expect(parseFileArg([`--file=${file}`])).toBe(file);
  });

  it('classifies by real path: a sibling like "..private" is inside, a symlink out of the repo is outside', () => {
    expect(() => assertOutsideRepository(path.join(repoRoot, '..private'))).toThrow(/リポジトリの外/);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-out-'));
    const link = path.join(repoRoot, `tq-link-${process.pid}`);
    fs.symlinkSync(outside, link);
    try {
      // The link lives in the repo but points outside: the real path decides.
      expect(() => assertOutsideRepository(path.join(link, 'codes.json'))).not.toThrow();
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('refuses a mapping file inside the repository', () => {
    expect(() => assertOutsideRepository(path.join(repoRoot, 'codes.json'))).toThrow(/リポジトリの外/);
    expect(() => assertOutsideRepository(path.join(os.tmpdir(), 'codes.json'))).not.toThrow();
  });

  it('shows its own command in the --target usage', () => {
    expect(() => resolveTarget([], { env: {}, command: 'sync:unlock-codes' })).toThrow(/npm run sync:unlock-codes/);
    expect(() => resolveTarget([], { env: {} })).toThrow(/npm run sync:missions/);
  });
});

describe('publishCodes', () => {
  const target = { name: 'local', url: 'http://127.0.0.1:54321', key: 'sb_secret_TESTONLY' };
  const payload = { codes: [{ code: SECRET_CODE, item_key: 'wand' }] };

  it('posts the payload to the service-role RPC and returns the counts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ inserted: 1 }) });
    await expect(publishCodes(target, payload, fetchImpl)).resolves.toEqual({ inserted: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:54321/rest/v1/rpc/publish_unlock_codes');
    expect(JSON.parse(init.body)).toEqual({ payload });
    expect(init.headers.Authorization).toBe('Bearer sb_secret_TESTONLY');
  });

  it('reports a refusal and a lost connection without the key or the codes', async () => {
    const refused = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: '22023', message: 'bad' }) });
    await expect(publishCodes(target, payload, refused)).rejects.toThrow('HTTP 400 22023 bad');
    const down = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }));
    const error = await publishCodes(target, payload, down).catch(e => e);
    expect(error.message).toMatch(/ECONNREFUSED/);
    expect(error.message).not.toContain('sb_secret_TESTONLY');
    expect(error.message).not.toContain(SECRET_CODE);
  });
});

describe('sync:unlock-codes CLI (child process)', () => {
  const run = (args, env = {}) =>
    spawnSync(process.execPath, ['tasks/sync_unlock_codes/index.js', ...args], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    });
  const writeTemp = content => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-codes-'));
    const file = path.join(dir, 'codes.json');
    fs.writeFileSync(file, content);
    return file;
  };

  it('exits 1 without --file', () => {
    const result = run(['--target', 'local']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--file/);
  });

  it('exits 1 for an invalid mapping before anything is sent, without printing the code', () => {
    const file = writeTemp(JSON.stringify([{ code: SECRET_CODE, item_key: 'no_such_item' }]));
    const result = run(['--target', 'local', '--file', file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/同梱のアイテムカタログに無い/);
    expect(result.stdout + result.stderr).not.toContain(SECRET_CODE);
  });

  it('exits 1 for a file that is not JSON', () => {
    const result = run(['--target', 'local', '--file', writeTemp('{')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JSON/);
  });

  it('exits 1 for a valid mapping without --target', () => {
    const file = writeTemp(JSON.stringify([{ code: 'A', item_key: 'wand' }]));
    const result = run(['--file', file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--target/);
  });
});

describe('package.json', () => {
  it('has the sync:unlock-codes script', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(scripts['sync:unlock-codes']).toBe('node tasks/sync_unlock_codes/index.js');
  });
});
