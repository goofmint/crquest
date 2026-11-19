import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../../../js/app/platform/paths', () => ({
  getGamePackageVersion: vi.fn(),
}));
vi.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { pageview: vi.fn(), analyticsId: 'guid' },
}));
vi.mock('../../../js/app/common/listener', () => ({ __esModule: true, default: { stop_listening: vi.fn(), listen: vi.fn() } }));
vi.mock('../../../js/app/common/context', () => ({
  setContext: vi.fn(),
  getContext: vi.fn(),
  flushPendingSaves: vi.fn(),
  saveLanguagePreference: vi.fn(),
}));
vi.mock('../../../js/app/platform/dialog', () => ({ showConfirm: vi.fn() }));
vi.mock('../../../js/app/components/ClearDataButton', () => ({ default: () => null }));
vi.mock('../../../js/app/components/AvatarSelector', () => ({ default: () => null }));
vi.mock('../../../js/app/components/menu/settings/EnvironmentVariables', () => ({ default: () => null }));
vi.mock('../../../js/app/components/menu/settings/AdventureTeams', () => ({
  JoinTeam: () => null,
  CurrentTeam: () => null,
}));
vi.mock('../../../js/app/components/menu/settings/Operations', () => ({
  JoinOperation: () => null,
  CurrentOperation: () => null,
}));
vi.mock('../../../js/app/components/menu/settings/AudioTab', () => ({ default: () => null }));
vi.mock('../../../js/app/components/menu/settings/UnlocksTab', () => ({ default: () => null }));
vi.mock('../../../js/app/components/menu/settings/Credits', () => ({ default: () => null }));
vi.mock('../../../js/app/components/menu/settings/Extensions', () => ({ default: () => null }));

import Settings from '../../../js/app/components/menu/settings/Settings';
import { getGamePackageVersion } from '../../../js/app/platform/paths';
import { flushPendingSaves, saveLanguagePreference } from '../../../js/app/common/context';
import { showConfirm } from '../../../js/app/platform/dialog';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const versionText = (container) =>
  container.querySelector('.game-version').textContent;

describe('Settings game version', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    const setState = vi.spyOn(ref.current, 'setState');
    unmount();
    resolveVersion('1.2.3');
    await act(flush);
    expect(setState).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('Settings language selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGamePackageVersion.mockResolvedValue('1.2.3');
  });

  test('keeps the current language when the player cancels', async () => {
    showConfirm.mockResolvedValue(false);
    render(<Settings subnav="User" name="Player" />);
    const language = screen.getByLabelText('Language');
    await act(async () => fireEvent.change(language, { target: { value: 'ja' } }));

    expect(showConfirm).toHaveBeenCalledOnce();
    expect(saveLanguagePreference).not.toHaveBeenCalled();
    expect(language).toHaveValue('en');
    expect(language).toBeEnabled();
  });

  test('reports persistence failure and allows retrying', async () => {
    showConfirm.mockResolvedValue(true);
    saveLanguagePreference.mockRejectedValueOnce(new Error('save failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<Settings subnav="User" name="Player" />);
      const language = screen.getByLabelText('Language');
      await act(async () => fireEvent.change(language, { target: { value: 'ja' } }));

      expect(saveLanguagePreference).toHaveBeenCalledWith('ja');
      expect(flushPendingSaves).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save the language setting');
      expect(language).toHaveValue('en');
      expect(language).toBeEnabled();
    } finally {
      error.mockRestore();
    }
  });
});
