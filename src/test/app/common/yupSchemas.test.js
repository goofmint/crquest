// Characterization tests for the yup schemas used by the app. They pin the
// behavior that the game relies on (validation results, defaults, casting and
// the schema description with its meta) so that yup upgrades are verifiable.
vi.mock('../../../js/app/components/game/DynamicLevel', () => ({
  __esModule: true,
  default: class MockDynamicLevel {},
}));

import * as yup from 'yup';
import extendYup from '../../../js/app/common/extendYup';
import {
  getContextSchema,
  getHackObjectSchema,
  validateContextUpdate,
  describeSchema,
} from '../../../js/app/common/context/schema';
import DynamicLevel from '../../../js/app/components/game/DynamicLevel';
import EntityConfigService from '../../../js/app/components/game/EntityConfigService';

beforeAll(() => {
  extendYup();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

function validate(key, value) {
  return validateContextUpdate({ [key]: value })[0];
}

describe('extendYup custom methods', () => {
  test('func accepts functions, null and undefined; rejects others', () => {
    const schema = yup.mixed().func();
    expect(schema.isValidSync(() => {})).toBe(true);
    expect(schema.isValidSync(undefined)).toBe(true);
    expect(schema.isValidSync('nope')).toBe(false);
    expect(schema.isValidSync(5)).toBe(false);
  });

  test('map validates keys and values', () => {
    const schema = yup.object().map({
      keySchema: yup.string(),
      valueSchema: yup.boolean(),
    });
    expect(schema.isValidSync({ a: true, b: false })).toBe(true);
    expect(schema.isValidSync({ a: 'x' })).toBe(false);
  });

  test('map honors nullable()', () => {
    const map = {
      keySchema: yup.string(),
      valueSchema: yup.boolean(),
    };
    expect(
      yup
        .object()
        .nullable()
        .map(map)
        .isValidSync(null)
    ).toBe(true);
    expect(
      yup
        .object()
        .map(map)
        .isValidSync(null)
    ).toBe(false);
  });

  test('isInstanceOf', () => {
    class Thing {}
    const schema = yup.object().isInstanceOf(Thing);
    expect(schema.isValidSync(new Thing())).toBe(true);
    expect(schema.isValidSync({})).toBe(false);
  });

  test('isObjectiveKey', () => {
    const schema = yup.string().isObjectiveKey();
    expect(schema.isValidSync('level.objective')).toBe(true);
    expect(schema.isValidSync('a.b.c')).toBe(false);
  });

  test('isItemKey', () => {
    expect(yup.string().isItemKey().isValidSync('some_item')).toBe(true);
  });
});

describe('context schema', () => {
  test('accepts valid slices and returns the cast update', () => {
    expect(validate('xp', 10)).toEqual({ key: 'xp', valid: true, update: 10 });
    expect(validate('showTitle', true).valid).toBe(true);
    expect(validate('toastMessage', null).valid).toBe(true);
    expect(validate('liveEvent', null).valid).toBe(true);
    expect(validate('unlockCodes', null).valid).toBe(true);
    expect(validate('inventory', ['a', 'b']).update).toEqual(['a', 'b']);
  });

  test('rejects invalid slices with a ValidationError', () => {
    const negative = validate('xp', -1);
    expect(negative.valid).toBe(false);
    expect(negative.error).toBeInstanceOf(yup.ValidationError);
    expect(validate('xp', 1.5).valid).toBe(false);
    expect(validate('xp', undefined).valid).toBe(false);
    expect(validate('xp', null).valid).toBe(false);
    expect(validate('showTitle', 'abc').valid).toBe(false);
    expect(validate('settings', { avatar: 7 }).valid).toBe(false);
    expect(validate('settings', { avatar: 2, extra: 1 }).update).toEqual({
      avatar: 2,
    });
  });

  test('settings: avatar default', () => {
    expect(validate('settings', { name: 'x' }).update).toEqual({
      name: 'x',
      avatar: 1,
    });
  });

  test('user: default and noUnknown', () => {
    expect(validate('user', { guid: 'g', other: 1 }).update).toEqual({
      guid: 'g',
    });
  });

  test('completedObjectives is a map of objective keys', () => {
    const ok = validate('completedObjectives', {
      'level.obj': {
        missionName: 'm',
        objectiveName: 'o',
        completedOn: new Date(0),
      },
    });
    expect(ok.valid).toBe(true);
    expect(ok.update['level.obj'].missionName).toBe('m');
    expect(validate('completedObjectives', { 'a.b.c': {} }).valid).toBe(false);
  });

  test('env map and migrations map', () => {
    expect(
      validate('env', { A: { name: 'A', value: '1', concealed: false } }).valid
    ).toBe(true);
    expect(validate('migrations', { m1: true }).valid).toBe(true);
    expect(validate('migrations', { m1: 'x' }).valid).toBe(false);
  });

  test('overlayComponent accepts strings and component objects', () => {
    expect(validate('overlayComponent', 'foo').valid).toBe(true);
    expect(
      validate('overlayComponent', { key: 'k', props: {} }).valid
    ).toBe(true);
  });

  test('currentMenu requires a name', () => {
    expect(validate('currentMenu', { name: 'a' }).valid).toBe(true);
    expect(validate('currentMenu', {}).valid).toBe(false);
    expect(validate('currentMenu', null).valid).toBe(true);
  });

  test('teams requires id and joinCode', () => {
    expect(
      validate('teams', { joined: [{ id: '1', joinCode: 'a' }] }).valid
    ).toBe(true);
    expect(validate('teams', { joined: [{ id: '1' }] }).valid).toBe(false);
  });

  test('describeSchema exposes fields with meta flags', () => {
    const { fields } = describeSchema();
    expect(fields.hasSeenCinematic.meta).toEqual({ saveToDisk: true });
    expect(fields.user.meta.persistOnClearProgess).toBe(true);
    expect(fields.completedObjectives.meta.syncToBackend).toBe(true);
    expect(fields.showTitle.meta).toBeUndefined();
    expect(Object.keys(fields)).toContain('xp');
  });

  test('hack object schema', () => {
    const level = new DynamicLevel();
    const result = getHackObjectSchema().cast({
      level,
      objectiveName: 'o',
    });
    expect(typeof result.markAsComplete).toBe('function');
    expect(result.complete).toBe(false);
    expect(
      getHackObjectSchema().isValidSync({ level, objectiveName: 'o' })
    ).toBe(true);
    expect(
      getHackObjectSchema().isValidSync({ level: {}, objectiveName: 'o' })
    ).toBe(false);
    expect(
      getHackObjectSchema().isValidSync({ level, objectiveName: 5 })
    ).toBe(false);
    expect(getContextSchema().isValidSync({ unknownKey: 1 })).toBe(false);
  });
});

describe('EntityConfigService.validateConfig', () => {
  test('applies defaults', () => {
    const cast = EntityConfigService.validateConfig({
      properties: { sprite: {} },
    });
    expect(cast.animations).toEqual({});
    expect(cast.spriteSheets).toEqual({});
    expect(cast.properties.sprite.useGidAsDefaultFrameIndex).toBe(false);
    expect(cast.properties.sprite.layers).toEqual([]);
    expect(cast.properties.sprite.defaultFrameIndex).toBe(0);
  });

  test('rejects wrong types', () => {
    expect(() =>
      EntityConfigService.validateConfig({
        render: 'x',
        properties: { sprite: {} },
      })
    ).toThrow(yup.ValidationError);
    expect(() =>
      EntityConfigService.validateConfig({
        properties: { sprite: { defaultFrameIndex: 'abc' } },
      })
    ).toThrow(yup.ValidationError);
  });

  test('keeps function members', () => {
    const render = () => {};
    const cast = EntityConfigService.validateConfig({
      render,
      properties: { sprite: {} },
    });
    expect(cast.render).toBe(render);
  });
});
