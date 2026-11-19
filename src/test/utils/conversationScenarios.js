// Shared by the conversation template tests (Tauri implementation, Tauri
// bundle in a VM): the .pug files of the repository, a context that records
// what a template does to the level state, and the recorded results of the
// former Electron implementation (`pug.renderFile`) that they must reproduce.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const repoRoot = path.resolve(__dirname, '../../..');

// Every conversation template of the repository (tracked files only)
export function listPugFiles() {
  return execFileSync('git', ['ls-files', '*.pug'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(file => file && !/\.[a-z]{2,3}(?:-[\w]+)*\.pug$/i.test(file))
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

// ---------------------------------------------------------------------------
// Recorded results of the Electron implementation (platform/conversationTemplate
// before the Electron removal, #65): src/test/fixtures/conversationTemplate/*.json.
// A result is an `outcome()` whose absolute paths are replaced by placeholders
// and whose separators are '/', so that it is the same on every machine.
// ---------------------------------------------------------------------------
export const RECORDED_DIR = path.join(repoRoot, 'src', 'test', 'fixtures', 'conversationTemplate');
export const REPO_PLACEHOLDER = '<repo>';
export const FIXTURE_DIR_PLACEHOLDER = '<fixtures>';

export function toPortableText(text, replacements) {
  let result = text.replace(/\\/g, '/');
  for (const [absolute, placeholder] of replacements) {
    result = result.split(absolute.replace(/\\/g, '/')).join(placeholder);
  }
  return result;
}

// `replacements`: [[absolute directory, placeholder], ...]
export function toPortableOutcome(value, replacements) {
  if (typeof value === 'string') return toPortableText(value, replacements);
  if (Array.isArray(value)) return value.map(item => toPortableOutcome(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toPortableOutcome(item, replacements)])
    );
  }
  return value;
}

// The recorded key of a render: the state ('empty' or 'all') and the
// lastResponse that was passed, if any.
export function renderKey(stateName, lastResponse) {
  return lastResponse === undefined ? stateName : `${stateName} / ${lastResponse}`;
}

export function readRecorded(name) {
  return JSON.parse(fs.readFileSync(path.join(RECORDED_DIR, name), 'utf8'));
}

// The path of a repository template as used for the recorded keys
export function recordedFileKey(file) {
  return path.relative(repoRoot, file).replace(/\\/g, '/');
}
