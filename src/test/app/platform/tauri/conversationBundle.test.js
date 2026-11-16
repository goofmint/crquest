// The Tauri bundle of the conversation code (the Tauri conversationTemplate
// with pug 3, and cheerio) executed in a VM context that has only what a
// webview has: no `require`, `process`, `Buffer`, `module` or `global`, and
// the Node builtins (`fs`, `stream`, `zlib`, `buffer`, ...) are the throwing
// stubs of the Tauri build. Loading the bundle and rendering a conversation
// must not touch any of them (#139, docs/migration/tauri-runtime.md W8).
import nodeFs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import {
  ANY_STATE,
  REPO_PLACEHOLDER,
  createContext,
  listPugFiles,
  readRecorded,
  recordedFileKey,
  renderKey,
  repoRoot,
  toPortableOutcome,
} from '../../../utils/conversationScenarios';
import { createFixtureDirectory, removeFixtureDirectory } from '../../../utils/conversationFixtures';

describe('conversation bundle (--mode tauri) in a VM without Node globals', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let code;
  let sandbox;
  let conversation;
  let reads;
  let dir;

  beforeAll(async () => {
    const result = await build({
      configFile: path.join(repoRoot, 'vite.config.mjs'),
      mode: 'tauri',
      logLevel: 'silent',
      build: {
        write: false,
        rolldownOptions: {
          input: path.join(repoRoot, 'src/test/fixtures/tauriConversationEntry.js'),
          output: { format: 'iife' },
        },
      },
    });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    const chunks = outputs.filter(o => o.type === 'chunk');
    expect(chunks).toHaveLength(1);
    code = chunks[0].code;

    dir = createFixtureDirectory();
    reads = [];
    // The only host objects: web platform APIs a webview has, and the Tauri
    // IPC that @tauri-apps/plugin-fs calls (file reads of this test)
    const window = {
      __TAURI_INTERNALS__: {
        async invoke(command, args) {
          if (command !== 'plugin:fs|read_text_file') throw new Error(`unexpected command ${command}`);
          reads.push(args.path);
          try {
            return [...nodeFs.readFileSync(args.path)];
          } catch (error) {
            throw 'No such file or directory (os error 2)';
          }
        },
      },
    };
    sandbox = vm.createContext({ TextDecoder, TextEncoder, URL, console });
    sandbox.window = window;
    sandbox.self = sandbox;
    vm.runInContext(code, sandbox, { filename: 'conversation-bundle.js' });
    conversation = sandbox.__conversation;
  }, 120000);

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (dir) removeFixtureDirectory(dir);
  });

  test('the context has no Node globals', () => {
    for (const name of ['require', 'process', 'Buffer', 'module', 'exports', 'global', '__dirname']) {
      expect(vm.runInContext(`typeof ${name}`, sandbox)).toBe('undefined');
    }
  });

  test('the bundle contains pug 3 and cheerio from public/node_modules and the stubs, not Node', () => {
    expect(code).toContain('// public/node_modules/pug/lib/index.js');
    expect(code).toContain('// public/node_modules/cheerio/lib/');
    expect(code).toContain('The Node module \\"fs\\" is not available in the Tauri build');
    // the patched Buffer check of pug (vite.config.mjs patchPugBuffer)
    expect(code).not.toContain('Buffer.isBuffer(contents)');
  });

  test('cheerio parses in the VM (the selectors of Conversation.jsx)', () => {
    const html = '<conversation display_name="N"><statement id="a">Hi <b>there</b></statement>' +
      '<responses><response id="x">One</response><response id="y">Two</response></responses></conversation>';
    const $ = conversation.cheerio.load(html);
    expect($('conversation').attr('display_name')).toBe('N');
    expect($('conversation>statement').html()).toBe('Hi <b>there</b>');
    expect(
      $('conversation>responses').children('response').toArray().map(r => [$(r).attr('id'), $(r).text()])
    ).toEqual([['x', 'One'], ['y', 'Two']]);
  });

  test('every .pug file renders in the VM to the recorded Electron result (empty and all-set state)', async () => {
    // Recorded before the Electron implementation was removed (#65)
    const recordedRepository = readRecorded('repository.json');
    let rendered = 0;
    for (const file of listPugFiles()) {
      for (const [stateName, state] of [['empty', {}], ['all', ANY_STATE]]) {
        const recorded = recordedRepository[recordedFileKey(file)][renderKey(stateName)];
        const vmSide = createContext(state);
        let actual;
        try {
          actual = { html: await conversation.renderConversationTemplate(file, vmSide.context) };
        } catch (error) {
          actual = { error: error.message };
        }
        const expected =
          recorded.html === undefined ? { error: recorded.errorMessage } : { html: recorded.html };
        expect(toPortableOutcome(actual, [[repoRoot, REPO_PLACEHOLDER]]), file).toEqual(expected);
        expect(vmSide.context.filename).toBe(file);
        expect(vmSide.setStateCalls, file).toEqual(recorded.setStateCalls);
        if (expected.html !== undefined) rendered++;
      }
    }
    expect(rendered).toBeGreaterThan(100);
  }, 120000);

  test('an include is read through the Tauri fs plugin only', async () => {
    reads.length = 0;
    const { context } = createContext();
    const html = await conversation.renderConversationTemplate(path.join(dir, 'extending.pug'), context);
    expect(html).toContain('Extended');
    expect(reads.map(p => path.relative(dir, p))).toEqual([
      'extending.pug',
      'layout.pug',
      path.join('parts', 'deeper.pug'),
      path.join('parts', 'inner.pug'),
    ]);
  });

  test('a template that uses a pug filter fails where it is used (they need module resolution)', async () => {
    const file = path.join(dir, 'filter.pug');
    nodeFs.writeFileSync(file, 'conversation\n  statement\n    :upper\n      text\n');
    const error = await conversation
      .renderConversationTemplate(file, createContext().context)
      .catch(e => e);
    // pug's own error for a filter it cannot resolve (jstransformer-* packages
    // cannot be found without Node's module resolution)
    expect(error.message).toContain('unknown filter ":upper"');
  });
});
