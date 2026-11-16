// platform/tauri/conversationTemplate.js against platform/conversationTemplate.js
// (Electron, `pug.renderFile`): the same HTML, `context.filename` and setState
// calls for every .pug file of the repository and for the fixtures, and the
// same errors, with the files read through the (mocked) Tauri fs plugin.
import nodeFs from 'node:fs';

const plugin = vi.hoisted(() => ({ readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { renderConversationTemplate as renderElectron } from '../../../../js/app/platform/conversationTemplate';
import { renderConversationTemplate as renderTauri } from '../../../../js/app/platform/tauri/conversationTemplate';
import { ANY_STATE, createContext, listPugFiles, outcome } from '../../../utils/conversationScenarios';
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

async function both(file, state, extra) {
  const electron = await outcome(renderElectron, file, state, extra);
  const tauri = await outcome(renderTauri, file, state, extra);
  return { electron, tauri };
}

describe('Tauri conversation templates equal the Electron ones', () => {
  describe('fixtures', () => {
    let dir;
    beforeAll(() => {
      dir = createFixtureDirectory();
    });
    afterAll(() => removeFixtureDirectory(dir));

    const successes = Object.keys(FIXTURE_FILES).filter(
      name => !name.includes('/') && !/error|missing|layout|deeper/.test(name)
    );

    test.each(successes)('%s', async name => {
      for (const [state, extra] of [
        [{}, {}],
        [{ WORLD: { visits: 7 } }, { lastResponse: 'go' }],
      ]) {
        const { electron, tauri } = await both(`${dir}/${name}`, state, extra);
        expect(electron.html).toBeDefined();
        expect(tauri).toEqual(electron);
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
        const { electron, tauri } = await both(`${dir}/${name}`, {});
        expect(electron.errorMessage).toBeDefined();
        expect(tauri).toEqual(electron);
      }
    });

    test('a missing template rejects with ENOENT, like Electron', async () => {
      const { electron, tauri } = await both(`${dir}/absent.pug`, {});
      expect(electron.errorCode).toBe('ENOENT');
      expect(tauri.errorCode).toBe('ENOENT');
    });

    test('a missing include has the code and the "at <file> line <n>" suffix of Electron', async () => {
      const { electron, tauri } = await both(`${dir}/missing-include.pug`, {});
      const suffix = `\n    at ${slashes(dir)}/missing-include.pug line 2`;
      expect(electron.errorCode).toBe('ENOENT');
      expect(tauri.errorCode).toBe('ENOENT');
      expect(slashes(electron.errorMessage).endsWith(suffix)).toBe(true);
      expect(slashes(tauri.errorMessage).endsWith(suffix)).toBe(true);
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
      expect(withInclude.map(f => f.split('/').pop())).toEqual(['scientist1.pug']);
    });

    test('same result for an empty state, an all-set state and every lastResponse', async () => {
      let rendered = 0;
      let renderedWithInclude = 0;
      let failed = 0;
      for (const file of files) {
        const hasInclude = /^\s*include\s/m.test(nodeFs.readFileSync(file, 'utf8'));
        for (const state of [{}, ANY_STATE]) {
          const { electron, tauri } = await both(file, state);
          expect(tauri, file).toEqual(electron);
          if (electron.html === undefined) {
            failed++;
            continue;
          }
          rendered++;
          if (hasInclude) renderedWithInclude++;
          for (const lastResponse of responseIds(electron.html)) {
            const next = await both(file, state, { lastResponse });
            expect(next.tauri, `${file} ${lastResponse}`).toEqual(next.electron);
            if (next.electron.html !== undefined) rendered++;
          }
        }
      }
      // The comparison must be about real renders, not only about equal errors
      expect(rendered).toBeGreaterThan(300);
      expect(renderedWithInclude).toBeGreaterThan(0);
      expect(failed).toBeLessThan(files.length);
    }, 120000);
  });
});
