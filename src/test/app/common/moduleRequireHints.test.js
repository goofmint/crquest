import path from 'path';
import jetpack from 'fs-jetpack';
import * as fsPlatform from '../../../js/app/platform/fs';
import {
  TQ_NPC_NAMES,
  getExtraRequiresFor,
} from '../../../js/app/common/moduleRequireHints';
import { createModuleLoader } from '../../../js/app/common/moduleLoader';
import {
  isAllowedBuiltIn,
  getBuiltIn,
} from '../../../js/app/common/moduleAllowlist';
import { normalize } from '../../../js/app/common/modulePath';

const TQ_NPC_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content',
  'twilioquest-base',
  'objects',
  'tq-npc'
);

describe('moduleRequireHints', () => {
  test('lists the animations of the tq-npc builder', () => {
    expect(getExtraRequiresFor('/x/objects/tq-npc/builder.js')).toEqual(
      TQ_NPC_NAMES.map(name => `./animations/${name}`)
    );
  });

  test('gives no hints to other files', () => {
    expect(getExtraRequiresFor('/x/objects/other/builder.js')).toEqual([]);
    expect(getExtraRequiresFor('/x/objects/tq-npc/config.js')).toEqual([]);
  });

  test('TQ_NPC_NAMES matches NPC_LIST in the vendored builder.js', () => {
    const source = jetpack.read(path.join(TQ_NPC_PATH, 'builder.js'), 'utf8');
    const listSource = /const NPC_LIST = (\[[\s\S]*?\]);/.exec(source)[1];

    expect([...TQ_NPC_NAMES]).toEqual(
      listSource.match(/'([^']+)'/g).map(quoted => quoted.slice(1, -1))
    );
  });

  test('every hinted animation file exists', () => {
    TQ_NPC_NAMES.forEach(name => {
      expect(
        jetpack.exists(path.join(TQ_NPC_PATH, 'animations', `${name}.js`))
      ).toBe('file');
    });
  });

  test('the real loader runs the tq-npc config and builder with the hints', async () => {
    const loader = createModuleLoader({
      readFile: fsPlatform.readFile,
      stat: fsPlatform.stat,
      isAllowed: isAllowedBuiltIn,
      getAllowed: getBuiltIn,
      getExtraRequires: getExtraRequiresFor,
    });
    const config = await loader.load(
      normalize(path.join(TQ_NPC_PATH, 'config.js'))
    );

    expect(Object.keys(config.animations)).toEqual(
      TQ_NPC_NAMES.map(name => `npc_${name}_idle`)
    );
  });

  test('without the hints the builder fails explicitly', async () => {
    const loader = createModuleLoader({
      readFile: fsPlatform.readFile,
      stat: fsPlatform.stat,
      isAllowed: isAllowedBuiltIn,
      getAllowed: getBuiltIn,
    });

    await expect(
      loader.load(normalize(path.join(TQ_NPC_PATH, 'config.js')))
    ).rejects.toMatchObject({ code: 'ERR_MODULE_NOT_PRELOADED' });
  });
});
