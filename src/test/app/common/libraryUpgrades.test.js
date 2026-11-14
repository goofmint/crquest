// Pins the behavior of third-party libraries that were upgraded in #51
// (dexie, uuid, showdown, immutability-helper).
import { Converter } from 'showdown';
import update from 'immutability-helper';
import { v4 } from 'uuid';
import db from '../../../js/app/common/database';
import { BUILT_IN_MODULES } from '../../../js/app/common/moduleAllowlist';

describe('dexie database', () => {
  test('keeps the existing database name, table and indexes', async () => {
    await db.open();
    expect(db.name).toBe('TwilioQuest');
    expect(db.tables.map(table => table.name)).toEqual(['completedObjectives']);
    const { schema } = db.completedObjectives;
    expect(schema.primKey.name).toBe('id');
    expect(schema.primKey.auto).toBe(true);
    expect(schema.indexes.map(index => index.src).sort()).toEqual(
      ['&[objectiveName+missionName]', 'completedOn', 'missionName', 'objectiveName', 'xp'].sort()
    );
    // Dexie stores schema version N as IndexedDB version N * 10
    expect(db.verno).toBe(1);
    expect(db.backendDB().version).toBe(10);
  });

  test('stores rows and enforces the unique compound index', async () => {
    await db.open();
    await db.completedObjectives.clear();
    const row = { objectiveName: 'o', missionName: 'm', completedOn: 1, xp: 5 };
    const id = await db.completedObjectives.add(row);
    expect(typeof id).toBe('number');
    await expect(db.completedObjectives.add(row)).rejects.toBeDefined();
    expect(await db.completedObjectives.count()).toBe(1);
    await db.completedObjectives.clear();
  });
});

describe('uuid', () => {
  test('v4 generates RFC 4122 v4 ids', () => {
    expect(v4()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(v4()).not.toBe(v4());
  });

  test('the module allowlist exposes v4 to extensions', () => {
    expect(typeof BUILT_IN_MODULES.uuid.v4).toBe('function');
  });
});

describe('showdown', () => {
  test('renders markdown the way the hack interface expects', () => {
    const converter = new Converter({ openLinksInNewWindow: true });
    converter.setFlavor('vanilla');
    const html = converter.makeHtml('# Title\n\n*a* [x](https://e.com)\n\n- one\n- two');
    expect(html).toContain('<h1 id="title">Title</h1>');
    expect(html).toContain('<em>a</em>');
    // setFlavor('vanilla') resets openLinksInNewWindow (same in showdown 1.x)
    expect(html).toContain('<a href="https://e.com">x</a>');
    expect(html).toContain('<li>one</li>');
  });

  test('github flavor renders tables and strikethrough', () => {
    const converter = new Converter({ openLinksInNewWindow: true });
    converter.setFlavor('github');
    const html = converter.makeHtml('~~x~~ [x](https://e.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<del>x</del>');
    expect(html).toContain(
      '<a href="https://e.com" rel="noopener noreferrer" target="_blank">x</a>'
    );
    expect(html).toContain('<table>');
  });
});

describe('immutability-helper', () => {
  test('$merge on a nested key does not mutate the original', () => {
    const env = { A: { name: 'A', value: '1' } };
    const next = update(env, { A: { $merge: { value: '2' } } });
    expect(next).toEqual({ A: { name: 'A', value: '2' } });
    expect(env.A.value).toBe('1');
  });
});
