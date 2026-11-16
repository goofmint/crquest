// platform/tauri/conversationTemplate.js against the results that the Electron
// implementation (`pug.renderFile`) gave before it was removed (#65), recorded
// in src/test/fixtures/conversationTemplate/: the same HTML, `context.filename`
// and setState calls for every .pug file of the repository and for the
// fixtures, and the same errors, with the files read through the (mocked) Tauri
// fs plugin.
import nodeFs from 'node:fs';
import nodePath from 'node:path';

const plugin = vi.hoisted(() => ({ readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { renderConversationTemplate as renderTauri } from '../../../../js/app/platform/tauri/conversationTemplate';
import {
  ANY_STATE,
  FIXTURE_DIR_PLACEHOLDER,
  REPO_PLACEHOLDER,
  createContext,
  listPugFiles,
  outcome,
  readRecorded,
  recordedFileKey,
  renderKey,
  repoRoot,
  toPortableOutcome,
} from '../../../utils/conversationScenarios';
import { FIXTURE_FILES, createFixtureDirectory, removeFixtureDirectory } from '../../../utils/conversationFixtures';

beforeEach(() => {
  plugin.readTextFile.mockReset();
  plugin.readTextFile.mockImplementation(async path => {
    try {
      return nodeFs.readFileSync(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw 'No such file or directory (os error 2)';
      throw String(error.message);
    }
  });
});

// Pug-resolved paths use the native separator (backslashes on Windows)
const slashes = text => text.replace(/\\/g, '/');

// The response ids of a rendered conversation: the lastResponse values to try
function responseIds(html) {
  return [...html.matchAll(/<response id="([^"]+)"/g)].map(m => m[1]);
}

const recordedRepository = readRecorded('repository.json');
const recordedFixtures = readRecorded('fixtures.json');

// What the Tauri implementation did, as the recorded results are written
async function tauriOutcome(file, state, extra, replacements) {
  return toPortableOutcome(await outcome(renderTauri, file, state, extra), replacements);
}

describe('Tauri conversation templates equal the recorded Electron results', () => {
  describe('fixtures', () => {
    let dir;
    beforeAll(() => {
      dir = createFixtureDirectory();
    });
    afterAll(() => removeFixtureDirectory(dir));

    const successes = Object.keys(FIXTURE_FILES).filter(
      name => !name.includes('/') && !/error|missing|layout|deeper/.test(name)
    );

    const fixtureOutcome = (name, state, extra) =>
      tauriOutcome(`${dir}/${name}`, state, extra, [[dir, FIXTURE_DIR_PLACEHOLDER]]);

    test.each(successes)('%s', async name => {
      for (const [recordedName, state, extra] of [
        ['empty', {}, {}],
        ['visits 7 / go', { WORLD: { visits: 7 } }, { lastResponse: 'go' }],
      ]) {
        const recorded = recordedFixtures[name][recordedName];
        expect(recorded.html).toBeDefined();
        expect(await fixtureOutcome(name, state, extra)).toEqual(recorded);
      }
    });

    test('every file is read once, the root first, through the plugin', async () => {
      await renderTauri(`${dir}/extending.pug`, createContext().context);
      expect(plugin.readTextFile.mock.calls.map(call => slashes(call[0]))).toEqual([
        `${slashes(dir)}/extending.pug`,
        `${slashes(dir)}/layout.pug`,
        `${slashes(dir)}/parts/deeper.pug`,
        `${slashes(dir)}/parts/inner.pug`,
      ]);
    });

    test('the same errors', async () => {
      for (const name of ['syntax-error.pug', 'runtime-error.pug']) {
        const recorded = recordedFixtures[name].empty;
        expect(recorded.errorMessage).toBeDefined();
        expect(await fixtureOutcome(name, {}, {})).toEqual(recorded);
      }
    });

    test('a missing template rejects with ENOENT, like Electron', async () => {
      const tauri = await fixtureOutcome('absent.pug', {}, {});
      expect(tauri.errorCode).toBe('ENOENT');
    });

    test('a missing include has the code and the "at <file> line <n>" suffix of Electron', async () => {
      const recorded = recordedFixtures['missing-include.pug'].empty;
      const tauri = await fixtureOutcome('missing-include.pug', {}, {});
      const suffix = `\n    at ${FIXTURE_DIR_PLACEHOLDER}/missing-include.pug line 2`;
      expect(recorded.errorCode).toBe('ENOENT');
      expect(tauri.errorCode).toBe('ENOENT');
      expect(recorded.errorMessage.endsWith(suffix)).toBe(true);
      expect(tauri.errorMessage.endsWith(suffix)).toBe(true);
    });

    test('a failed read is not retried forever', async () => {
      await renderTauri(`${dir}/missing-include.pug`, createContext().context).catch(() => {});
      expect(plugin.readTextFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('every .pug file of the repository', () => {
    const files = listPugFiles();

    test('there are templates, and only scientist1.pug uses include (covered by the fixtures too)', () => {
      expect(files.length).toBeGreaterThanOrEqual(100);
      const withInclude = files.filter(f => /^\s*include\s/m.test(nodeFs.readFileSync(f, 'utf8')));
      expect(withInclude.map(f => nodePath.basename(f))).toEqual(['scientist1.pug']);
    });

    test('every recorded template is a template of the repository, and the reverse', () => {
      expect(Object.keys(recordedRepository).sort()).toEqual(files.map(recordedFileKey).sort());
    });

    test('same result for an empty state, an all-set state and every lastResponse', async () => {
      let rendered = 0;
      let renderedWithInclude = 0;
      let failed = 0;
      for (const file of files) {
        const key = recordedFileKey(file);
        const recordedFile = recordedRepository[key];
        const hasInclude = /^\s*include\s/m.test(nodeFs.readFileSync(file, 'utf8'));
        const portable = (state, extra) =>
          tauriOutcome(file, state, extra, [[repoRoot, REPO_PLACEHOLDER]]);
        const seen = new Set();
        for (const [stateName, state] of [
          ['empty', {}],
          ['all', ANY_STATE],
        ]) {
          const recorded = recordedFile[renderKey(stateName)];
          seen.add(renderKey(stateName));
          expect(await portable(state), key).toEqual(recorded);
          if (recorded.html === undefined) {
            failed++;
            continue;
          }
          rendered++;
          if (hasInclude) renderedWithInclude++;
          for (const lastResponse of responseIds(recorded.html)) {
            const name = renderKey(stateName, lastResponse);
            seen.add(name);
            expect(await portable(state, { lastResponse }), `${key} ${name}`).toEqual(recordedFile[name]);
            if (recordedFile[name].html !== undefined) rendered++;
          }
        }
        // nothing was recorded that the loop did not compare
        expect([...seen].sort(), key).toEqual(Object.keys(recordedFile).sort());
      }
      // The comparison must be about real renders, not only about equal errors
      expect(rendered).toBeGreaterThan(300);
      expect(renderedWithInclude).toBeGreaterThan(0);
      expect(failed).toBeLessThan(files.length);
    }, 120000);
  });
});
