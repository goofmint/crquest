import React from 'react';
import { shallow } from 'enzyme';

jest.mock('electron', () => ({ remote: {} }));
jest.mock('../../../js/app/platform/paths', () => ({
  getGamePackageVersion: jest.fn(),
}));
jest.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { pageview: jest.fn(), analyticsId: 'guid' },
}));
jest.mock('../../../js/app/common/listener', () => ({ __esModule: true, default: {} }));
jest.mock('../../../js/app/common/context', () => ({
  setContext: jest.fn(),
  getContext: jest.fn(),
}));
jest.mock('../../../js/app/components/ClearDataButton', () => () => null);
jest.mock('../../../js/app/components/AvatarSelector', () => () => null);
jest.mock('../../../js/app/components/menu/settings/EnvironmentVariables', () => () => null);
jest.mock('../../../js/app/components/menu/settings/AdventureTeams', () => ({
  JoinTeam: () => null,
  CurrentTeam: () => null,
}));
jest.mock('../../../js/app/components/menu/settings/Operations', () => ({
  JoinOperation: () => null,
  CurrentOperation: () => null,
}));
jest.mock('../../../js/app/components/menu/settings/AudioTab', () => () => null);
jest.mock('../../../js/app/components/menu/settings/UnlocksTab', () => () => null);
jest.mock('../../../js/app/components/menu/settings/Credits', () => () => null);
jest.mock('../../../js/app/components/menu/settings/Extensions', () => () => null);

import Settings from '../../../js/app/components/menu/settings/Settings';
import { getGamePackageVersion } from '../../../js/app/platform/paths';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const versionText = (wrapper) => wrapper.find('.game-version').text();

describe('Settings game version', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    getGamePackageVersion.mockReset();
  });

  test('shows nothing for the version while loading, then the version', async () => {
    getGamePackageVersion.mockResolvedValue('1.2.3');
    const wrapper = shallow(<Settings />);
    expect(versionText(wrapper)).not.toContain('1.2.3');
    await flush();
    wrapper.update();
    expect(versionText(wrapper)).toContain('TerminalQuest v1.2.3');
  });

  test('shows an explicit error and no version when loading fails', async () => {
    getGamePackageVersion.mockRejectedValue(new Error('boom'));
    const wrapper = shallow(<Settings />);
    await flush();
    wrapper.update();
    expect(versionText(wrapper)).toContain('failed to load version: boom');
    expect(versionText(wrapper)).not.toMatch(/ v\d/);
    expect(errorSpy).toHaveBeenCalled();
  });

  test('does not update state after unmount', async () => {
    let resolveVersion;
    getGamePackageVersion.mockReturnValue(new Promise((r) => { resolveVersion = r; }));
    const wrapper = shallow(<Settings />);
    const setState = jest.spyOn(wrapper.instance(), 'setState');
    wrapper.unmount();
    resolveVersion('1.2.3');
    await flush();
    expect(setState).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
