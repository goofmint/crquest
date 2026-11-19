import path from 'path';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

// #108 findings 3 and 4: the Fog Owl tutorial must run once for the real
// event sequence (levelDidLoad then mapDidLoad, handleTutorial not awaited by
// events.js) and its completion flag must be persisted right at completion.
// The fake world mirrors src/js/app/common/world.js: getState returns the
// stored value by reference, setState replaces the whole key. Every setState
// value is also recorded as a snapshot (what would reach the disk).

const requireContent = createRequire(import.meta.url);
const FOG_OWL = path.resolve(
  __dirname,
  '../../../../public/content/twilioquest-base/levels/fog_owl'
);
const events = requireContent(path.join(FOG_OWL, 'events.js'));
const handleTutorial = requireContent(
  path.join(FOG_OWL, 'events/handleTutorial.js')
);
const { STATE_KEY } = requireContent(path.join(FOG_OWL, 'events/config.js'));

const makeWorld = ({ onWait } = {}) => {
  const state = {};
  const saved = [];
  const calls = [];
  const record = name => (...args) => {
    calls.push(name);
    return args;
  };
  const world = {
    t: (_, fallback) => fallback,
    getState: key => state[key],
    setState: (key, value) => {
      state[key] = value;
      saved.push(JSON.parse(JSON.stringify(value)));
    },
    wait: async ms => {
      calls.push('wait');
      if (onWait) await onWait(ms);
    },
    tweenCameraToPosition: async () => {
      calls.push('tweenCameraToPosition');
    },
    tweenCameraToPlayer: async () => {
      calls.push('tweenCameraToPlayer');
    },
    disablePlayerMovement: record('disablePlayerMovement'),
    enablePlayerMovement: record('enablePlayerMovement'),
    showNotification: record('showNotification'),
    showEntities: record('showEntities'),
    hideEntities: record('hideEntities'),
    analytics: { event: record('analytics') },
  };
  return { world, state, saved, calls };
};

const count = (calls, name) => calls.filter(c => c === name).length;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('fog_owl tutorial (#108 findings 3 and 4)', () => {
  it('(a) runs once for levelDidLoad + mapDidLoad and persists the completion flag', async () => {
    const { world, saved, calls } = makeWorld();
    events({ name: 'levelDidLoad' }, world);
    events({ name: 'mapDidLoad', mapName: 'default' }, world);
    await settle();

    expect(count(calls, 'showNotification')).toBe(3);
    expect(count(calls, 'analytics')).toBe(1);
    expect(saved[saved.length - 1].hasSeenTutorial).toBe(true);

    // After completion a further event neither repeats the tutorial nor loses the flag
    events({ name: 'levelWillUnload' }, world);
    await settle();
    expect(count(calls, 'showNotification')).toBe(3);
    expect(saved[saved.length - 1].hasSeenTutorial).toBe(true);
  });

  it('(a) does not replay when the persisted state already has the flag', async () => {
    const { world, state, calls } = makeWorld();
    state[STATE_KEY] = { hasSeenTutorial: true, showNavMapArrow: true };
    events({ name: 'levelDidLoad' }, world);
    await settle();
    expect(count(calls, 'wait')).toBe(0);
    expect(count(calls, 'showNotification')).toBe(0);
  });

  it('(b) a failure releases the guard so a later event can retry', async () => {
    let fail = true;
    const { world, saved, calls } = makeWorld({
      onWait: async () => {
        if (fail) {
          fail = false;
          throw new Error('wait failed');
        }
      },
    });
    const worldState = {};
    await expect(handleTutorial({}, world, worldState)).rejects.toThrow(
      'wait failed'
    );
    expect(worldState.hasSeenTutorial).toBeUndefined();
    expect(saved).toEqual([]);

    await handleTutorial({}, world, worldState);
    expect(count(calls, 'showNotification')).toBe(3);
    expect(saved[saved.length - 1].hasSeenTutorial).toBe(true);
  });

  it('(c) keeps same-key state committed while the tutorial was awaiting', async () => {
    // The first wait() runs synchronously inside events.js, before its own
    // trailing setState; commit on the second one, a real mid-tutorial await.
    let waits = 0;
    const harness = makeWorld({
      onWait: async () => {
        waits += 1;
        if (waits === 2) {
          const current = harness.world.getState(STATE_KEY);
          harness.world.setState(STATE_KEY, { ...current, other: 'kept' });
        }
      },
    });
    events({ name: 'levelDidLoad' }, harness.world);
    await settle();

    const last = harness.saved[harness.saved.length - 1];
    expect(last.other).toBe('kept');
    expect(last.hasSeenTutorial).toBe(true);
  });

  it('(d) a single run keeps the same call sequence as before the fix', async () => {
    const { world, calls } = makeWorld();
    await handleTutorial({}, world, {});
    expect(calls).toEqual([
      'wait',
      'disablePlayerMovement',
      'tweenCameraToPosition',
      'showNotification',
      'wait',
      'tweenCameraToPosition',
      'showNotification',
      'wait',
      'tweenCameraToPlayer',
      'showNotification',
      'enablePlayerMovement',
      'showEntities',
      'analytics',
    ]);
  });
});
