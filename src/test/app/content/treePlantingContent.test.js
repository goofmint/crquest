import path from 'path';
import fs from 'fs';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

// The three former Firebase POSTs (Fog Owl objective, Developer Fundamentals
// objective, Earth Day trees) now record through the helper / world API. The
// local result never depends on the answer: `success` is called for every
// result, and the Earth Day state and notification are kept when the
// recording fails (docs/supabase/unlocks-and-trees.md).

const requireContent = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../../../../public');
const fogOwl = requireContent(
  path.join(ROOT, 'content/twilioquest-base/levels/fog_owl/objectives/owl_plant_tree1/validator.js')
);
const devSkills = requireContent(
  path.join(ROOT, 'levels/common/dev_skills/objectives/skills_plant_tree1/validator.js')
);
const { handleTreeInteraction } = requireContent(path.join(ROOT, 'levels/common/events/trees.js'));

const RESULTS = ['recorded', 'already_recorded', 'pending', 'signed_out', 'unsupported'];

const makeHelper = result => {
  const helper = {
    recordTreePlanting: vi.fn().mockResolvedValue(result),
    t: (_key, fallback) => fallback,
    success: vi.fn(),
    fail: vi.fn(),
  };
  return helper;
};

describe.each([
  ['Fog Owl', fogOwl],
  ['Developer Fundamentals', devSkills],
])('%s plant a tree validator', (_name, validator) => {
  it.each(RESULTS)('succeeds locally when the result is %s', async result => {
    const helper = makeHelper(result);
    await validator(helper);
    expect(helper.recordTreePlanting).toHaveBeenCalledTimes(1);
    expect(helper.success).toHaveBeenCalledTimes(1);
    expect(helper.fail).not.toHaveBeenCalled();
    expect(String(helper.success.mock.calls[0][0]).trim().length).toBeGreaterThan(0);
  });

  it('uses a message for each kind of result', async () => {
    const messages = new Set();
    for (const result of RESULTS) {
      const helper = makeHelper(result);
      await validator(helper);
      messages.add(helper.success.mock.calls[0][0].replace(/\s+/g, ' ').trim());
    }
    // recorded, already recorded, pending, signed out, and the final fallback
    expect(messages.size).toBe(5);
  });

  it('does not call the network or send identifiers itself', () => {
    const source = fs.readFileSync(
      validator === fogOwl
        ? path.join(ROOT, 'content/twilioquest-base/levels/fog_owl/objectives/owl_plant_tree1/validator.js')
        : path.join(ROOT, 'levels/common/dev_skills/objectives/skills_plant_tree1/validator.js'),
      'utf8'
    );
    expect(source).not.toMatch(/fetch\(|firebase|analyticsId|playerName/);
  });
});

describe('Earth Day tree interaction', () => {
  const makeWorld = ({ recordTreePlanting = vi.fn().mockResolvedValue('recorded'), state = {} } = {}) => {
    const calls = [];
    const stored = { ...state };
    const world = {
      getState: key => stored[key],
      setState: vi.fn((key, value) => {
        calls.push('setState');
        stored[key] = value;
      }),
      showEntities: vi.fn(() => calls.push('showEntities')),
      showNotification: vi.fn(() => calls.push('showNotification')),
      recordTreePlanting: vi.fn((...args) => {
        calls.push('recordTreePlanting');
        return recordTreePlanting(...args);
      }),
    };
    return { world, stored, calls };
  };
  const interact = (key = 'devskills_tree1') => ({
    name: 'playerDidInteract',
    target: { earthdayTree: true, key },
  });

  it('shows the tree, saves the state, then records the planting without waiting', async () => {
    const { world, stored, calls } = makeWorld({ recordTreePlanting: vi.fn(() => new Promise(() => {})) });
    await handleTreeInteraction(interact(), world);
    expect(stored.earthdayTrees).toEqual({ devskills_tree1: true });
    expect(world.showNotification).toHaveBeenCalledTimes(1);
    expect(world.recordTreePlanting).toHaveBeenCalledWith('devskills_tree1');
    expect(calls.indexOf('setState')).toBeLessThan(calls.indexOf('recordTreePlanting'));
  });

  it('keeps the state and the notification when the recording fails', async () => {
    const { world, stored } = makeWorld({ recordTreePlanting: vi.fn().mockRejectedValue(new Error('offline')) });
    await handleTreeInteraction(interact(), world);
    expect(stored.earthdayTrees).toEqual({ devskills_tree1: true });
    expect(world.showNotification).toHaveBeenCalledTimes(1);
  });

  it('does not record a tree that was already found', async () => {
    const { world } = makeWorld({ state: { earthdayTrees: { devskills_tree1: true } } });
    await handleTreeInteraction(interact(), world);
    expect(world.recordTreePlanting).not.toHaveBeenCalled();
    expect(world.showNotification).toHaveBeenCalledTimes(1);
    expect(world.setState).toHaveBeenCalledTimes(1);
  });

  it('records the tree only once for two interactions', async () => {
    const { world } = makeWorld();
    await handleTreeInteraction(interact(), world);
    await handleTreeInteraction(interact(), world);
    expect(world.recordTreePlanting).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['another event', { name: 'levelDidLoad', target: { earthdayTree: true, key: 'k' } }],
    ['no target', { name: 'playerDidInteract' }],
    ['a target that is not a tree', { name: 'playerDidInteract', target: { key: 'k' } }],
  ])('ignores %s', async (_name, event) => {
    const { world } = makeWorld();
    await handleTreeInteraction(event, world);
    expect(world.setState).not.toHaveBeenCalled();
    expect(world.recordTreePlanting).not.toHaveBeenCalled();
  });
});
