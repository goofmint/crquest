vi.mock('../../../../js/app/components/game/DynamicLevel', () => ({
  __esModule: true,
  default: class MockDynamicLevel {},
}));

import extendYup from '../../../../js/app/common/extendYup';

beforeAll(() => extendYup());

import {
  CLOUD_SAVE_SCHEMA_VERSION,
  createSnapshot,
  validateSnapshot,
  hasMeaningfulProgress,
  summarize,
  mergeMigrations,
  getCloudSaveFields,
} from '../../../../js/app/common/cloudSave/snapshot';

const fullContext = () => ({
  hasSeenCinematic: true,
  completedObjectives: {
    'mission-a/objective-1': { missionName: 'a', objectiveName: 'one', completedOn: new Date('2026-01-02T03:04:05Z') },
  },
  questStatus: { q: 1 },
  customAvatar: { sc: 1, ec: 2, hc: 3, hs: 4, uri: 'data:x' },
  inventory: ['tshirt', 'jeans', 'sword'],
  levelState: { l: { a: 1 } },
  loadout: { body: 'tshirt' },
  migrations: { m1: true, '2020-09-16_analytics_id_to_user_guid': true },
  settings: { avatar: 2, name: 'Pat', language: 'ja' },
  teams: { joined: [{ id: 't', joinCode: 'c', displayName: 'T' }] },
  operations: { joined: [] },
  unlockCodes: ['code'],
  xp: 42,
  // never uploaded
  env: { KEY: { name: 'KEY', value: 'secret', concealed: true } },
  extensions: { enabled: true, directory: '/Users/me/ext' },
  user: { guid: 'local-guid' },
  liveEvent: { id: 'e' },
  currentLevel: { levelName: 'x' },
});

describe('cloud save snapshot', () => {
  test('the cloud save fields are exactly the progress fields', () => {
    expect(getCloudSaveFields().sort()).toEqual(
      [
        'completedObjectives', 'customAvatar', 'hasSeenCinematic', 'inventory', 'levelState', 'loadout',
        'migrations', 'operations', 'questStatus', 'settings', 'teams', 'unlockCodes', 'xp',
      ].sort()
    );
  });

  test('never contains secrets, paths, the local GUID or the live event', () => {
    const snapshot = createSnapshot(fullContext());
    for (const key of ['env', 'extensions', 'user', 'liveEvent', 'currentLevel']) {
      expect(snapshot).not.toHaveProperty(key);
    }
    expect(JSON.stringify(snapshot)).not.toMatch(/secret|\/Users\/me|local-guid/);
  });

  test('is a frozen JSON copy; dates become ISO strings; the per-installation migration flag is left out', () => {
    const context = fullContext();
    const snapshot = createSnapshot(context);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.completedObjectives['mission-a/objective-1'].completedOn).toBe('2026-01-02T03:04:05.000Z');
    expect(snapshot.migrations).toEqual({ m1: true });
    context.xp = 1;
    context.inventory.push('x');
    expect(snapshot.xp).toBe(42);
    expect(snapshot.inventory).toHaveLength(3);
  });

  test('a snapshot validates against the context schema and survives a round trip', () => {
    const snapshot = createSnapshot(fullContext());
    const result = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
    expect(result.values).toEqual(JSON.parse(JSON.stringify(snapshot)));
    expect(CLOUD_SAVE_SCHEMA_VERSION).toBe(1);
  });

  test('rejects invalid data and drops fields that are not cloud save fields', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(validateSnapshot(null).ok).toBe(false);
    expect(validateSnapshot([]).ok).toBe(false);
    expect(validateSnapshot({ xp: -5 }).ok).toBe(false);
    expect(validateSnapshot({ xp: 'many' }).ok).toBe(false);
    expect(validateSnapshot({ settings: { avatar: 99 } }).ok).toBe(false);
    const result = validateSnapshot({ xp: 3, env: { A: { name: 'A', value: 'v' } }, user: { guid: 'g' } });
    expect(result).toEqual({ ok: true, values: { xp: 3 } });
    console.error.mockRestore();
  });

  test('the validated, cast value is kept, not the raw input', () => {
    const result = validateSnapshot({ xp: '5', completedObjectives: { 'a/b': { missionName: 'a', objectiveName: 'b', completedOn: '2026-01-02' } } });
    expect(result.ok).toBe(true);
    expect(result.values.xp).toBe(5);
    expect(summarize(result.values).xp).toBe(5);
    expect(typeof result.values.completedObjectives['a/b'].completedOn).toBe('string');
  });

  test('progress: only real progress counts, not names, keys or starter items', () => {
    expect(hasMeaningfulProgress(null)).toBe(false);
    expect(hasMeaningfulProgress({})).toBe(false);
    expect(
      hasMeaningfulProgress({
        settings: { name: 'Pat' },
        user: { guid: 'g' },
        xp: 0,
        completedObjectives: {},
        questStatus: {},
        levelState: {},
        inventory: ['tshirt', 'jeans'],
      })
    ).toBe(false);
    expect(hasMeaningfulProgress({ xp: 1 })).toBe(true);
    expect(hasMeaningfulProgress({ completedObjectives: { a: {} } })).toBe(true);
    expect(hasMeaningfulProgress({ questStatus: { a: 1 } })).toBe(true);
    expect(hasMeaningfulProgress({ levelState: { a: 1 } })).toBe(true);
    expect(hasMeaningfulProgress({ inventory: ['tshirt', 'jeans', 'hat'] })).toBe(true);
  });

  test('summary and migration merge', () => {
    expect(summarize({ xp: 5, completedObjectives: { a: 1, b: 2 } })).toEqual({ xp: 5, objectives: 2 });
    expect(summarize({})).toEqual({ xp: 0, objectives: 0 });
    expect(mergeMigrations({ a: true, b: false, local: true }, { b: true, c: true, '2020-09-16_analytics_id_to_user_guid': true })).toEqual({
      a: true,
      b: true,
      c: true,
      local: true,
    });
  });
});
