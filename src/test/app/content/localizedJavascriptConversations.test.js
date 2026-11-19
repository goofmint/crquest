import path from 'node:path';
import { renderConversationTemplate } from '../../../js/app/platform/conversationTemplate';
import { outcome, repoRoot } from '../../utils/conversationScenarios';

const STATE_KEY = 'TQ_JAVASCRIPT_WORLD_STATE';
const conversations = path.join(
  repoRoot, 'public/content/twilioquest-javascript/levels/javascript/conversations'
);

test.each([
  ['first visit', {}, {}, '研究の視察に来たオペレーター'],
  ['accident explanation', { explosionTriggered: true }, { lastResponse: 'what_happened' }, 'ダックタイピウムの結晶が不安定になった'],
  ['accident follow-up', { explosionTriggered: true }, { lastResponse: 'other_scientists' }, '施設のほかの区画に取り残されている'],
])('renders the Japanese scientist partial during %s', async (_, room1, extra, text) => {
  const file = path.join(conversations, 'scientist1.ja.pug');
  const state = { [STATE_KEY]: { room1 } };
  const result = await outcome(renderConversationTemplate, file, state, extra);

  expect(result.html).toContain(text);
});

test.each(['.pug', '.ja.pug'])('grants the green card once in %s', async suffix => {
  const file = path.join(conversations, 'visitor-signin-scientist' + suffix);
  const existingAccess = { red: { opened: ['storage'] } };
  const newVisitor = { [STATE_KEY]: { accessLevels: existingAccess } };
  const first = await outcome(renderConversationTemplate, file, newVisitor);
  expect(first.html).toContain('<statement id="default">');
  expect(first.setStateCalls).toEqual([
    [STATE_KEY, { accessLevels: { ...existingAccess, green: { opened: [] } } }],
  ]);

  const returningVisitor = {
    [STATE_KEY]: { accessLevels: { ...existingAccess, green: { opened: ['main'] } } },
  };
  const following = await outcome(renderConversationTemplate, file, returningVisitor);
  expect(following.html).toContain('<statement id="default_alt">');
  expect(following.setStateCalls).toEqual([]);
});
