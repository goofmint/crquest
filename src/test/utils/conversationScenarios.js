// Shared by the conversation template tests (Electron contract, Tauri parity,
// Tauri bundle in a VM): the .pug files of the repository and a context that
// records what a template does to the level state.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const repoRoot = path.resolve(__dirname, '../../..');

// Every conversation template of the repository (tracked files only)
export function listPugFiles() {
  return execFileSync('git', ['ls-files', '*.pug'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort()
    .map(file => path.join(repoRoot, file));
}

// A level state whose every key holds an object on which any property exists
// (a deep "everything is set" world), so that the branches that read nested
// world state run. Properties are created on first read and kept.
export const ANY_STATE = Symbol('any state');

function deepObject() {
  const target = {};
  return new Proxy(target, {
    get(object, property) {
      if (typeof property === 'symbol' || property === 'toJSON' || property === 'then') {
        return Reflect.get(object, property);
      }
      if (!(property in object)) object[property] = deepObject();
      return object[property];
    },
  });
}

// The context that Conversation.jsx builds (setCurrentNpcConversationInState),
// with the level state in `state` (key -> value). getState returns a copy, so
// a template that changes the object only changes the state through setState.
export function createContext(state = {}, extra = {}) {
  const setStateCalls = [];
  const context = {
    settings: { name: 'Player' },
    loadout: { items: [] },
    inventory: ['key'],
    env: { os: 'darwin' },
    completedObjectives: ['intro'],
    teams: [],
    operations: [],
    xp: 10,
    getState: key => {
      if (state === ANY_STATE) return deepObject();
      return key in state ? JSON.parse(JSON.stringify(state[key])) : undefined;
    },
    setState: (key, value) => setStateCalls.push([key, JSON.parse(JSON.stringify(value ?? null))]),
    ...extra,
  };
  return { context, setStateCalls };
}

// What a render did, in a form that two implementations can be compared on
export async function outcome(render, file, state, extra) {
  const { context, setStateCalls } = createContext(state, extra);
  try {
    const html = await render(file, context);
    return { html, filename: context.filename, setStateCalls };
  } catch (error) {
    return { errorName: error.name, errorMessage: error.message, errorCode: error.code, setStateCalls };
  }
}
