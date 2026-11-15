import path from 'path';
import {
  BUILT_IN_MODULES,
  isAllowedBuiltIn,
  getBuiltIn,
} from '../../../js/app/common/moduleAllowlist';

describe('moduleAllowlist', () => {
  test('allows exactly the specifiers in BUILT_IN_MODULES', () => {
    Object.keys(BUILT_IN_MODULES).forEach(specifier => {
      expect(isAllowedBuiltIn(specifier)).toBe(true);
      expect(getBuiltIn(specifier)).toBe(BUILT_IN_MODULES[specifier]);
    });
    expect(getBuiltIn('path')).toBe(path);
  });

  test('does not allow other Node modules or packages', () => {
    ['fs', 'child_process', 'os', 'electron', 'fs-jetpack', 'lodash'].forEach(
      specifier => {
        expect(isAllowedBuiltIn(specifier)).toBe(false);
      }
    );
  });

  test('does not treat Object.prototype members as allowed', () => {
    ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'].forEach(
      specifier => {
        expect(isAllowedBuiltIn(specifier)).toBe(false);
        expect(() => getBuiltIn(specifier)).toThrow(
          `"${specifier}" is not on the built-in module allowlist`
        );
      }
    );
  });

  test('getBuiltIn throws for a specifier that is not listed', () => {
    expect(() => getBuiltIn('fs')).toThrow(
      '"fs" is not on the built-in module allowlist'
    );
  });

  test('the allowlist cannot be modified', () => {
    expect(Object.isFrozen(BUILT_IN_MODULES)).toBe(true);
    expect(() => {
      'use strict';
      BUILT_IN_MODULES.fs = {};
    }).toThrow(TypeError);
    expect(isAllowedBuiltIn('fs')).toBe(false);
  });
});
