// A conversation directory on disk, for the conversation template tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURE_FILES = {
  'simple.pug': [
    'conversation(display_name=settings.name)',
    '  statement#hello.',
    '    Hello #{settings.name}, level #{xp}',
    '  responses',
    '    response#one.',
    '      First',
    '    response#two.',
    '      Second',
  ].join('\n'),
  'state.pug': [
    '- const world = getState("WORLD") || { visits: 0 }',
    '- world.visits += 1',
    'conversation(display_name="N")',
    '  if lastResponse === "go"',
    '    statement#went.',
    '      Went',
    '  else',
    '    statement#first.',
    '      Visit #{world.visits}',
    '- setState("WORLD", world)',
  ].join('\n'),
  'parts/inner.pug': ['response#inner.', '  Inner #{xp}'].join('\n'),
  'outer.pug': [
    'mixin shout(text)',
    '  response(id=text)= text.toUpperCase()',
    'conversation(display_name="Outer")',
    '  statement#s',
    '    p Inline <b>statement</b>',
    '  responses',
    '    include parts/inner.pug',
    '    +shout("loud")',
  ].join('\n'),
  'layout.pug': [
    'conversation(display_name="Layout")',
    '  block content',
  ].join('\n'),
  'extending.pug': [
    'extends layout.pug',
    'block content',
    '  statement#e.',
    '    Extended',
    '  include parts/deeper.pug',
  ].join('\n'),
  'parts/deeper.pug': ['responses', '  include inner.pug'].join('\n'),
  'statements.pug': [
    'conversation(display_name="Lookup")',
    '  statement#chosen',
    '  statements',
    '    statement#chosen',
    '      text.',
    '        Looked <i>up</i>',
  ].join('\n'),
  'missing-include.pug': ['conversation', '  include nowhere.pug'].join('\n'),
  'syntax-error.pug': ['conversation', '  statement(', '    text'].join('\n'),
  'runtime-error.pug': ['conversation', '  statement', '    | #{notDefined.value}'].join('\n'),
};

export function createFixtureDirectory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-conversation-'));
  for (const [name, content] of Object.entries(FIXTURE_FILES)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

export function removeFixtureDirectory(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
