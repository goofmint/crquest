import React from 'react';
import { render } from '@testing-library/react';

vi.mock('../../../../js/app/platform/store', () => ({ getValueAsync: vi.fn() }));
vi.mock('../../../../js/app/platform/dialog', () => ({ showAlert: vi.fn() }));
vi.mock('../../../../js/app/common/context', () => ({
  context: React.createContext({}),
  getContext: vi.fn(),
  setContext: vi.fn(),
  getSavedFields: vi.fn(),
}));
vi.mock('../../../../js/app/common/context/schema', () => ({
  reduceEntries: entries => Object.fromEntries(entries),
}));
vi.mock('../../../../js/app/components/context_provider/itemsHelper', () => ({ addItems: vi.fn() }));
vi.mock('../../../../js/app/components/context_provider/user', () => ({
  migrateAnalyticsIdToUserGuid: vi.fn(s => s),
  initializeUserIdentity: vi.fn(s => s),
}));
vi.mock('../../../../js/app/components/context_provider/system', () => ({
  initializeSystemInfo: vi.fn(s => s),
}));
vi.mock('../../../../js/app/components/context_provider/loadItemsFromDisk', () => ({
  default: vi.fn(),
}));
vi.mock('../../../../js/app/common/levelLoader', () => ({
  default: {
    importLevels: vi.fn(),
    getFullMissionList: vi.fn(async () => []),
    getInitialMission: vi.fn(() => 'mission'),
  },
}));
vi.mock('../../../../js/app/common/analytics', () => ({
  default: { initializeAnalytics: vi.fn() },
}));
vi.mock('../../../../js/app/common/assetLoader', () => ({ syncBundledAssets: vi.fn() }));

import ContextProvider from '../../../../js/app/components/context_provider/ContextProvider';
import { getValueAsync } from '../../../../js/app/platform/store';
import { showAlert } from '../../../../js/app/platform/dialog';
import { getSavedFields, setContext } from '../../../../js/app/common/context';
import loadItemsFromDisk from '../../../../js/app/components/context_provider/loadItemsFromDisk';

const DEFAULT_SETTINGS = { avatar: 1, name: '', language: 'en' };

function mountProvider() {
  const ref = React.createRef();
  render(<ContextProvider ref={ref} />);
  return ref;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadItemsFromDisk.mockResolvedValue({ sword: {} });
  getSavedFields.mockReturnValue(['settings', 'xp', 'inventory']);
  showAlert.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('ContextProvider saved field loading', () => {
  it('renders the defaults first, then applies truthy saved values to the initial state', async () => {
    getValueAsync.mockImplementation(async key => ({ settings: { avatar: 3, name: 'x' }, xp: 0 }[key]));
    const ref = mountProvider();
    // First render: defaults, nothing loaded yet.
    expect(ref.current.state.settings).toEqual(DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(setContext).toHaveBeenCalled());
    const initialState = setContext.mock.calls[0][0];
    expect(initialState.settings).toEqual({ avatar: 3, name: 'x', language: 'en' });
    // falsy saved values (0, undefined) are not applied: the default stays
    expect(initialState.xp).toBe(0);
    expect(initialState.inventory).toEqual([]);
    expect(initialState.items).toEqual({ sword: {} });
    expect(ref.current.state.settings).toEqual({ avatar: 3, name: 'x', language: 'en' });
  });

  it('reads saved fields one by one in schema order', async () => {
    const order = [];
    getValueAsync.mockImplementation(async key => {
      order.push(`start:${key}`);
      await Promise.resolve();
      order.push(`end:${key}`);
    });
    mountProvider();
    await vi.waitFor(() => expect(setContext).toHaveBeenCalled());
    expect(order).toEqual([
      'start:settings', 'end:settings', 'start:xp', 'end:xp', 'start:inventory', 'end:inventory',
    ]);
  });

  it('reports a read failure, stops, and does not initialize the state', async () => {
    const failure = new Error('corrupt');
    getValueAsync.mockRejectedValue(failure);
    // componentDidMount rethrows after reporting (as the sync throw used to
    // reject it); capture that rejection so it is not an unhandled one.
    const original = ContextProvider.prototype.componentDidMount;
    let mountResult;
    vi.spyOn(ContextProvider.prototype, 'componentDidMount').mockImplementation(function () {
      mountResult = original.call(this);
      return mountResult.catch(() => {});
    });
    const ref = mountProvider();
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    expect(setContext).not.toHaveBeenCalled();
    await expect(mountResult).rejects.toBe(failure);
    expect(ref.current.state.settings).toEqual(DEFAULT_SETTINGS);
    ContextProvider.prototype.componentDidMount.mockRestore();
  });
});
