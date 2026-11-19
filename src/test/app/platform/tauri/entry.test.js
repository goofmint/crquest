const mocks = vi.hoisted(() => ({
  order: [],
  initPlatform: vi.fn(),
  readSettings: vi.fn(),
}));

vi.mock('../../../../js/app/platform/init', () => ({
  initPlatform: async () => {
    mocks.order.push('init:start');
    await mocks.initPlatform();
    mocks.order.push('init:end');
  },
}));
vi.mock('../../../../js/app/platform/store', () => ({
  getValueAsync: async (key) => {
    mocks.order.push(`read:${key}`);
    return mocks.readSettings();
  },
}));
vi.mock('../../../../js/app/platform/menu', () => ({
  updateShellTexts: async () => mocks.order.push('shell'),
}));
vi.mock('../../../../js/tauriShell', () => ({
  installExternalLinkHandler: () => mocks.order.push('links'),
  installDevToolsShortcut: () => mocks.order.push('devtools'),
}));
vi.mock('../../../../js/index.jsx', () => {
  mocks.order.push('game');
  return {};
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  mocks.order.length = 0;
  mocks.readSettings.mockReset();
  vi.resetModules();
});

test('the game is loaded only after the platform is initialized', async () => {
  mocks.initPlatform.mockResolvedValue(undefined);
  mocks.readSettings.mockResolvedValue({ language: 'ja' });
  await import('../../../../js/tauriIndex.jsx');
  await flush();
  expect(mocks.order).toEqual(['init:start', 'init:end', 'read:settings', 'shell', 'links', 'devtools', 'game']);
  expect(document.documentElement.lang).toBe('ja');
});

test('an initialization failure stops startup and is reported', async () => {
  const failure = new Error('init failed');
  mocks.initPlatform.mockRejectedValue(failure);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  await import('../../../../js/tauriIndex.jsx');
  await flush();
  process.off('unhandledRejection', onUnhandled);
  expect(mocks.order).toEqual(['init:start']);
  expect(errors).toHaveBeenCalledWith('TerminalQuest failed to start:', failure);
  errors.mockRestore();
});
