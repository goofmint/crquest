import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import i18n from '../../../js/app/i18n';
import { renderConversationTemplate } from '../../../js/app/platform/conversationTemplate';
import { ANY_STATE, outcome, repoRoot } from '../../utils/conversationScenarios';

const publicDir = path.join(repoRoot, 'public');
const translations = ['content', 'levels'].flatMap(directory =>
  readdirSync(path.join(publicDir, directory), { recursive: true })
    .filter(name => /\.ja\.(json|md|pug)$/.test(name))
    .map(name => path.join(directory, name))
);

const read = file => readFileSync(path.join(publicDir, file), 'utf8');
const originalFile = file => file.replace(/\.ja(?=\.[^.]+$)/, '');
const capture = (source, pattern) => [...source.matchAll(pattern)]
  .map(match => match[1]).sort();
const variables = text => capture(text, /\{\{\s*([\w.-]+)\s*\}\}/g);

function flatten(tree, prefix = '') {
  return Object.fromEntries(Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[prefix + key, value]]
      : Object.entries(flatten(value, prefix + key + '.'))
  ));
}

test('UI dictionaries have matching keys and interpolation variables', () => {
  const en = flatten(i18n.getResourceBundle('en', 'translation'));
  const ja = flatten(i18n.getResourceBundle('ja', 'translation'));
  expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    expect(variables(ja[key]), key).toEqual(variables(en[key]));
  }
});

const displayFields = {
  'level.json': ['title', 'description', 'questTitle', 'questDescription', 'defaultGoal', 'flavorTextOverrides'],
  'objective.json': ['title', 'description', 'validation_fields'],
  'index.json': ['displayName', 'description'],
  'flavorText.json': ['text'],
};

const overlays = translations.filter(file =>
  file.endsWith('.json') && !file.endsWith('messages.ja.json')
);

test.each(overlays)('%s translates only existing display fields', file => {
  const original = JSON.parse(read(originalFile(file)));
  const overlay = JSON.parse(read(file));
  const allowed = displayFields[path.basename(originalFile(file))];
  for (const [key, value] of Object.entries(overlay)) {
    expect(allowed, key).toContain(key);
    expect(original, key).toHaveProperty([key]);
    if (key === 'validation_fields') {
      for (const field of value) {
        const originalField = original[key].find(item => item.name === field.name);
        expect(originalField, field.name).toBeDefined();
        for (const label of Object.keys(field)) {
          expect(['name', 'label', 'placeholder']).toContain(label);
          expect(typeof originalField[label]).toBe('string');
          expect(typeof field[label]).toBe('string');
        }
      }
    } else if (key === 'flavorTextOverrides' || key === 'text') {
      for (const [textKey, text] of Object.entries(value)) {
        expect(typeof original[key][textKey], textKey).toBe('string');
        expect(typeof text, textKey).toBe('string');
      }
    } else {
      expect(typeof value).toBe('string');
    }
  }
});

const markdown = translations.filter(file => file.endsWith('.md'));

test.each(markdown)('%s preserves template expressions, code and links', file => {
  const original = read(originalFile(file));
  const translated = read(file);
  for (const pattern of [
    /(<%[\s\S]*?%>)/g,
    /(```[\s\S]*?```)/g,
    /(<pre\b[^>]*>[\s\S]*?<\/pre>)/g,
    /`([^`\n]+)`/g,
    /\]\(([^)]+)\)/g,
    /href=["']([^"']+)["']/g,
  ]) {
    expect(capture(translated, pattern)).toEqual(capture(original, pattern));
  }
});

function checkMessageCalls(node, translate) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.property?.name === 't') {
    const [key, fallback, vars] = node.arguments;
    if (key?.type === 'StringLiteral') translate(key.value, fallback, vars);
  }
  for (const child of Array.isArray(node) ? node : Object.values(node)) {
    checkMessageCalls(child, translate);
  }
}

test('bundled message dictionaries preserve the interpolation variables of static calls', () => {
  const dictionaries = translations.filter(file => file.endsWith('messages.ja.json'));
  for (const file of dictionaries) {
    const entries = JSON.parse(read(file));
    const directory = path.dirname(file);
    for (const value of Object.values(entries)) {
      expect(typeof value, file).toBe('string');
    }
    const scripts = readdirSync(path.join(publicDir, directory), { recursive: true })
      .filter(script => script.endsWith('.js'));
    for (const script of scripts) {
      const source = read(path.join(directory, script));
      if (!source.includes('.t(')) continue;
      checkMessageCalls(parse(source), (key, fallback, vars) => {
        if (!Object.hasOwn(entries, key)) return;
        const expected = [...new Set(variables(entries[key]))];
        const literal = fallback?.type === 'StringLiteral' ? fallback.value
          : fallback?.type === 'TemplateLiteral'
            ? fallback.quasis.map(quasi => quasi.value.cooked).join('')
            : '';
        for (const name of variables(literal)) {
          expect(expected, `${file} / ${key}`).toContain(name);
        }
        if (expected.length && vars?.type === 'ObjectExpression') {
          const values = vars.properties.filter(prop => prop.type === 'ObjectProperty')
            .map(prop => prop.key.name ?? prop.key.value);
          for (const name of expected) {
            expect(values, `${file} / ${key}`).toContain(name);
          }
        }
      });
    }
  }
});

const conversations = translations.filter(file => file.endsWith('.pug'));
const ids = /((?:statement|response)(?:\([^\n]*?\))?#[\w-]+)/g;
const includes = /^\s*include\s+(\S+)/gm;
const renderedIds = /<(?:statement|response)\b[^>]*?\bid="([^"]+)"/g;

test.each(conversations)('%s preserves conversation IDs, includes and state updates', async file => {
  const original = originalFile(file);
  expect(capture(read(file), ids)).toEqual(capture(read(original), ids));
  expect(capture(read(file), includes).map(originalFile).sort())
    .toEqual(capture(read(original), includes));

  for (const state of [{}, ANY_STATE]) {
    const before = await outcome(renderConversationTemplate, path.join(publicDir, original), state);
    const after = await outcome(renderConversationTemplate, path.join(publicDir, file), state);
    expect(after.errorName).toBe(before.errorName);
    expect(after.setStateCalls).toEqual(before.setStateCalls);
    if (before.html !== undefined) {
      expect(capture(after.html, renderedIds)).toEqual(capture(before.html, renderedIds));
    }
  }
});

test.each([
  ['ghost.pug', 'Sacred Scroll Room'],
  ['ghost.ja.pug', '聖なる巻物の間'],
  ['head_of_house_turing.pug', 'Sacred Scroll Room'],
  ['head_of_house_turing.ja.pug', '聖なる巻物の間'],
])('%s offers the pledge response only after the player has the scroll', async (name, guidance) => {
  const file = path.join(
    publicDir, 'content', 'twilioquest-api-academy', 'levels', 'inside_perimeter', 'conversations', name
  );
  const state = {
    TQ_API_ACADEMY_WORLD_STATE: {
      insidePerimeter: { ghost_introduction: true },
      insideCatacombs: { keySpellsObtained: ['a', 'b', 'c', 'd'], hasPledgeScroll: false },
    },
  };
  const before = await outcome(renderConversationTemplate, file, state);
  expect(before.html).not.toContain('<response id="pledge_scroll">');
  const pendingResponse = await outcome(renderConversationTemplate, file, state, {
    lastResponse: name.startsWith('ghost') ? undefined : 'join_house',
  });
  expect(pendingResponse.html).toContain(guidance);

  state.TQ_API_ACADEMY_WORLD_STATE.insideCatacombs.hasPledgeScroll = true;
  const after = await outcome(renderConversationTemplate, file, state);
  expect(after.html).toContain('<response id="pledge_scroll">');
});
