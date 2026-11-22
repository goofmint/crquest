const { loadCatalog, loadVerificationDefinitions, publishVerificationDefinitions } = require('../../../tasks/sync_missions/supabase');

describe('server-side verification definitions (supabase/verification/definitions.json)', () => {
  const { definitions } = loadVerificationDefinitions();

  it('covers the representative objectives of each method', () => {
    const keys = definitions.map(d => `${d.mission_id}.${d.objective_id}`).sort();
    expect(keys).toEqual([
      'challenge-questions.ducktypium-chest',
      'challenge-questions.sum-array',
      'javascript.array2D',
    ]);
    expect(new Set(definitions.map(d => d.definition.method))).toEqual(
      new Set(['text_answer', 'result_vector'])
    );
  });

  it('refers only to objectives in the bundled catalog (points come from the catalog xp)', async () => {
    const catalog = await loadCatalog();
    const xp = new Map();
    for (const m of catalog.missions) for (const o of m.objectives) xp.set(`${m.id}.${o.id}`, o.xp);
    for (const d of definitions) {
      expect(xp.get(`${d.mission_id}.${d.objective_id}`)).toBeGreaterThan(0);
      expect(d.definition).not.toHaveProperty('points');
      expect(d).not.toHaveProperty('points');
    }
  });

  it('keeps result_vector case_count below the pool size and expected values consistent with sumArray', () => {
    const def = definitions.find(d => d.objective_id === 'sum-array').definition;
    expect(def.case_count).toBeGreaterThanOrEqual(1);
    expect(def.case_count).toBeLessThan(def.cases.length);
    for (const c of def.cases) {
      expect(Object.is(c.input.reduce((a, b) => a + b, 0), c.expected)).toBe(true);
    }
  });

  it('posts definitions to the service-role RPC without logging the key', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ inserted: 3, updated: 0, unchanged: 0, deleted: 0 }) };
    };
    const target = { url: 'http://127.0.0.1:54321', key: 'k' };
    await publishVerificationDefinitions(target, { definitions }, fetchImpl);
    expect(calls[0].url).toBe('http://127.0.0.1:54321/rest/v1/rpc/publish_verification_definitions');
    expect(JSON.parse(calls[0].options.body)).toEqual({ p_definitions: { definitions } });
  });
});
