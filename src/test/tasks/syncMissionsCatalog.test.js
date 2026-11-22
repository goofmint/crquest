const { buildCatalog } = require('../../../tasks/sync_missions/catalog');
const { loadCatalog } = require('../../../tasks/sync_missions/supabase');

function level(name, overrides = {}, objectives = []) {
  return {
    levelName: name,
    title: `Title ${name}`,
    description: `Desc ${name}`,
    is_mission: true,
    objectives: objectives.map(o => o.objectiveName),
    missionData: { objectives },
    ...overrides,
  };
}

function objective(name, rewards = { xp: 10 }, extra = {}) {
  return {
    objectiveName: name,
    title: `T ${name}`,
    description: `D ${name}`,
    rewards,
    validation_fields: [{ name: 'secret' }],
    ...extra,
  };
}

describe('buildCatalog', () => {
  it('keeps only manifest objectives, in manifest order', () => {
    const l = level('a', {}, [objective('x'), objective('y'), objective('z')]);
    l.objectives = ['z', 'x'];
    const { missions } = buildCatalog([{ extensionName: 'ext', levels: [l] }]);
    expect(missions[0].objectives.map(o => o.id)).toEqual(['z', 'x']);
  });

  it('defaults xp to 0 and is_mission to false', () => {
    const l = level('a', { is_mission: undefined }, [objective('x', {})]);
    const { missions } = buildCatalog([{ extensionName: 'ext', levels: [l] }]);
    expect(missions[0].is_mission).toBe(false);
    expect(missions[0].objectives[0].xp).toBe(0);
  });

  it('treats a slash reference as its last segment', () => {
    const l = level('a', {}, [objective('x')]);
    l.objectives = ['other/x'];
    const { missions } = buildCatalog([{ extensionName: 'ext', levels: [l] }]);
    expect(missions[0].objectives[0].id).toBe('x');
  });

  it('is independent of input order', () => {
    const a = level('a', {}, [objective('x')]);
    const b = level('b', {}, [objective('y')]);
    const one = buildCatalog([{ extensionName: 'e1', levels: [a, b] }]);
    const two = buildCatalog([{ extensionName: 'e1', levels: [b, a] }]);
    expect(two).toEqual(one);
    expect(one.missions.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('does not leak client-only fields', () => {
    const l = level('a', {}, [objective('x', { xp: 1, items: ['i'] })]);
    const text = JSON.stringify(buildCatalog([{ extensionName: 'e', levels: [l] }]));
    expect(text).not.toMatch(/validation_fields|items|validator|maps/);
  });

  it('rejects duplicate mission ids across extensions', () => {
    expect(() =>
      buildCatalog([
        { extensionName: 'e1', levels: [level('a')] },
        { extensionName: 'e2', levels: [level('a')] },
      ])
    ).toThrow(/"a".*e1.*e2/);
  });

  it.each(['x', { x: 1 }, null, 5])('rejects a non-array objectives manifest %p', value => {
    const l = level('a', { objectives: value });
    expect(() => buildCatalog([{ extensionName: 'e', levels: [l] }])).toThrow(/e\/levels\/a.*配列/);
  });

  it('accepts an empty or missing objectives manifest', () => {
    const empty = level('a', { objectives: [] });
    const missing = level('b', { objectives: undefined });
    const { missions } = buildCatalog([{ extensionName: 'e', levels: [empty, missing] }]);
    expect(missions.map(m => m.objectives)).toEqual([[], []]);
  });

  it('rejects duplicate objectives in the manifest', () => {
    const l = level('a', {}, [objective('x')]);
    l.objectives = ['x', 'x'];
    expect(() => buildCatalog([{ extensionName: 'e', levels: [l] }])).toThrow(/重複/);
  });

  it('rejects a manifest objective without metadata, naming the path', () => {
    const l = level('a', {}, []);
    l.objectives = ['ghost'];
    expect(() => buildCatalog([{ extensionName: 'e', levels: [l] }])).toThrow(
      /e\/levels\/a\/objectives\/ghost/
    );
  });

  it.each([-1, 1.5, '10', NaN])('rejects invalid xp %p', xp => {
    const l = level('a', {}, [objective('x', { xp })]);
    expect(() => buildCatalog([{ extensionName: 'e', levels: [l] }])).toThrow(/xp/);
  });
});

describe('bundled catalog', () => {
  it('loads 12 missions / 97 objectives deterministically', async () => {
    const first = await loadCatalog();
    const second = await loadCatalog();
    expect(first).toEqual(second);
    expect(first.missions).toHaveLength(12);
    expect(first.missions.reduce((n, m) => n + m.objectives.length, 0)).toBe(97);
  });
});
