import React from 'react';
import { render, act } from '@testing-library/react';

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
const versionText = (container) =>
  container.querySelector('.game-version').textContent;

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
    const { container } = render(<Settings />);
    expect(versionText(container)).not.toContain('1.2.3');
    await act(flush);
    expect(versionText(container)).toContain('TerminalQuest v1.2.3');
  });

  test('shows an explicit error and no version when loading fails', async () => {
    getGamePackageVersion.mockRejectedValue(new Error('boom'));
    const { container } = render(<Settings />);
    await act(flush);
    expect(versionText(container)).toContain('failed to load version: boom');
    expect(versionText(container)).not.toMatch(/ v\d/);
    expect(errorSpy).toHaveBeenCalled();
  });

  test('does not update state after unmount', async () => {
    let resolveVersion;
    getGamePackageVersion.mockReturnValue(new Promise((r) => { resolveVersion = r; }));
    const ref = React.createRef();
    const { unmount } = render(<Settings ref={ref} />);
    const setState = jest.spyOn(ref.current, 'setState');
    unmount();
    resolveVersion('1.2.3');
    await act(flush);
    expect(setState).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
