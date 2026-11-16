// Contract of platform/conversationTemplate.js (Electron), pinned before the
// Tauri implementation was added (#139): it is `pug.renderFile(path, context)`
// of the pug in public/node_modules, and Conversation.jsx parses the result
// with cheerio. The Tauri implementation is compared with these results in
// tauri/conversationTemplate.test.js.
import path from 'node:path';
import pug from 'pug';
import cheerio from 'cheerio';
import { renderConversationTemplate } from '../../../js/app/platform/conversationTemplate';
import { createContext } from '../../utils/conversationScenarios';
import { createFixtureDirectory, removeFixtureDirectory } from '../../utils/conversationFixtures';

// The selectors of ConversationBuilder.parse in Conversation.jsx
function parse(conversationHtml) {
  const $ = cheerio.load(conversationHtml);
  const displayName = $('conversation').attr('display_name');
  const responses = $('conversation>responses')
    .children('response')
    .toArray()
    .map(response => ({ key: $(response).attr('id'), text: $(response).text() }));
  const statementEl = $('conversation>statement');
  let text;
  if (statementEl[0].children.length > 0) {
    text = statementEl.html();
  } else {
    text = $(`conversation>statements>statement#${statementEl.attr('id')}>text`).html();
  }
  return { displayName, statement: { key: statementEl.attr('id'), text }, responses };
}

describe('renderConversationTemplate (Electron)', () => {
  let dir;
  const file = name => path.join(dir, name);
  const render = (name, state, extra) => {
    const { context, setStateCalls } = createContext(state, extra);
    return renderConversationTemplate(file(name), context).then(html => ({ html, context, setStateCalls }));
  };

  beforeAll(() => {
    dir = createFixtureDirectory();
  });
  afterAll(() => removeFixtureDirectory(dir));

  test('is exactly pug.renderFile on the same file and context', async () => {
    const a = createContext();
    const b = createContext();
    const expected = pug.renderFile(file('simple.pug'), a.context);
    expect(await renderConversationTemplate(file('simple.pug'), b.context)).toBe(expected);
    expect(expected).toBe(
      '<conversation display_name="Player"><statement id="hello">Hello Player, level 10</statement>' +
        '<responses><response id="one">First</response><response id="two">Second</response></responses></conversation>'
    );
  });

  test('the context is the template locals, and pug writes context.filename', async () => {
    const { context } = createContext();
    const before = Object.keys(context).sort();
    expect(context.filename).toBeUndefined();
    await renderConversationTemplate(file('simple.pug'), context);
    expect(context.filename).toBe(file('simple.pug'));
    expect(Object.keys(context).sort()).toEqual([...before, 'filename'].sort());
  });

  test('setState / getState calls of the template reach the context', async () => {
    const first = await render('state.pug', {});
    expect(first.html).toContain('Visit 1');
    expect(first.setStateCalls).toEqual([['WORLD', { visits: 1 }]]);
    const second = await render('state.pug', { WORLD: { visits: 4 } });
    expect(second.html).toContain('Visit 5');
    expect(second.setStateCalls).toEqual([['WORLD', { visits: 5 }]]);
    const go = await render('state.pug', {}, { lastResponse: 'go' });
    expect(go.html).toBe('<conversation display_name="N"><statement id="went">Went</statement></conversation>');
  });

  test('include (relative, nested), mixins and extends', async () => {
    const outer = await render('outer.pug', {});
    expect(outer.html).toBe(
      '<conversation display_name="Outer"><statement id="s"><p>Inline <b>statement</b></p></statement>' +
        '<responses><response id="inner">Inner 10</response><response id="loud">LOUD</response></responses></conversation>'
    );
    const extending = await render('extending.pug', {});
    expect(extending.html).toBe(
      '<conversation display_name="Layout"><statement id="e">Extended</statement>' +
        '<responses><response id="inner">Inner 10</response></responses></conversation>'
    );
  });

  test('cheerio parses the rendered HTML into the conversation', async () => {
    expect(parse((await render('simple.pug', {})).html)).toEqual({
      displayName: 'Player',
      statement: { key: 'hello', text: 'Hello Player, level 10' },
      responses: [
        { key: 'one', text: 'First' },
        { key: 'two', text: 'Second' },
      ],
    });
    expect(parse((await render('outer.pug', {})).html).statement.text).toBe('<p>Inline <b>statement</b></p>');
    // An empty statement looks its text up in <statements>
    expect(parse((await render('statements.pug', {})).html)).toEqual({
      displayName: 'Lookup',
      statement: { key: 'chosen', text: 'Looked <i>up</i>' },
      responses: [],
    });
  });

  describe('errors', () => {
    const failure = name => render(name, {}).then(
      () => null,
      error => error
    );

    test('a missing template rejects with ENOENT', async () => {
      const error = await renderConversationTemplate(file('absent.pug'), createContext().context).catch(e => e);
      expect(error.code).toBe('ENOENT');
    });

    test('a missing include names the including file and line', async () => {
      const error = await failure('missing-include.pug');
      expect(error.code).toBe('ENOENT');
      expect(error.message).toContain(`at ${file('missing-include.pug')} line 2`);
    });

    test('a syntax error is a pug error with the file and line', async () => {
      const error = await failure('syntax-error.pug');
      expect(error.message).toContain(`${file('syntax-error.pug')}:`);
      expect(error.msg).toBeDefined();
    });

    test('a runtime error of the template is reported with the line', async () => {
      const error = await failure('runtime-error.pug');
      expect(error).toBeInstanceOf(TypeError);
      // In a window (the renderer, jsdom) pug_rethrow only adds the line
      expect(error.message).toBe("Cannot read properties of undefined (reading 'value') on line 3");
    });
  });
});
