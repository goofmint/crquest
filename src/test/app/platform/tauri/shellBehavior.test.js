const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  toggleDevTools: vi.fn(),
  showAlert: vi.fn(),
}));

vi.mock('../../../../js/app/platform/shell', () => ({ openExternal: mocks.openExternal }));
vi.mock('../../../../js/app/platform/devtools', () => ({ toggleDevTools: mocks.toggleDevTools }));
vi.mock('../../../../js/app/platform/dialog', () => ({ showAlert: mocks.showAlert }));

import {
  installDevToolsShortcut,
  installExternalLinkHandler,
  isDevToolsShortcut,
} from '../../../../js/tauriShell';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeDoc() {
  const doc = document.implementation.createHTMLDocument('t');
  installExternalLinkHandler(doc);
  installDevToolsShortcut(doc);
  return doc;
}

function addLink(doc, href) {
  const a = doc.createElement('a');
  a.setAttribute('href', href);
  doc.body.appendChild(a);
  return a;
}

function click(element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function press(doc, init) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  doc.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('external links', () => {
  test('an http(s) link is opened externally and the default action is prevented', () => {
    mocks.openExternal.mockResolvedValue(undefined);
    const doc = makeDoc();
    const event = click(addLink(doc, 'https://example.com/a/b?x=1&y=2#frag'));
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/a/b?x=1&y=2#frag');
  });

  test('a link without a query gets the same trailing "?" as the Electron handler', () => {
    mocks.openExternal.mockResolvedValue(undefined);
    click(addLink(makeDoc(), 'http://example.com/'));
    expect(mocks.openExternal).toHaveBeenCalledWith('http://example.com/?');
  });

  test.each(['#top', '/relative', 'mailto:a@example.com', 'file:///etc/hosts', 'ftp://example.com/'])(
    '%s is left alone',
    href => {
      const event = click(addLink(makeDoc(), href));
      expect(event.defaultPrevented).toBe(false);
      expect(mocks.openExternal).not.toHaveBeenCalled();
    }
  );

  test('a failure to open is logged and shown, not swallowed', async () => {
    const failure = new Error('not allowed');
    mocks.openExternal.mockRejectedValue(failure);
    mocks.showAlert.mockResolvedValue(undefined);
    click(addLink(makeDoc(), 'https://example.com/'));
    await flush();
    expect(console.error).toHaveBeenCalled();
    expect(mocks.showAlert).toHaveBeenCalledWith(
      'Opening https://example.com/? failed: not allowed'
    );
  });
});

describe('isDevToolsShortcut', () => {
  test.each([
    [{ key: 'F12' }, true],
    [{ key: 'F12', shiftKey: true }, false],
    [{ code: 'KeyI', ctrlKey: true, shiftKey: true }, true],
    [{ code: 'KeyI', metaKey: true, altKey: true }, true],
    [{ code: 'KeyI', ctrlKey: true }, false],
    [{ code: 'KeyI', metaKey: true, altKey: true, shiftKey: true }, false],
    [{ code: 'KeyJ', ctrlKey: true, shiftKey: true }, false],
    [{ key: 'a' }, false],
  ])('%j -> %p', (init, expected) => {
    expect(isDevToolsShortcut({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init })).toBe(expected);
  });
});

describe('DevTools shortcut', () => {
  test('toggles DevTools', () => {
    mocks.toggleDevTools.mockResolvedValue(undefined);
    const event = press(makeDoc(), { key: 'F12' });
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.toggleDevTools).toHaveBeenCalledTimes(1);
  });

  test('other keys do nothing', () => {
    press(makeDoc(), { key: 'a' });
    expect(mocks.toggleDevTools).not.toHaveBeenCalled();
  });

  test('a refusal (release build) is shown to the user', async () => {
    mocks.toggleDevTools.mockRejectedValue(new Error('DevTools are not available in release builds'));
    mocks.showAlert.mockResolvedValue(undefined);
    press(makeDoc(), { key: 'F12' });
    await flush();
    expect(mocks.showAlert).toHaveBeenCalledWith(
      'Toggling Developer Tools failed: DevTools are not available in release builds'
    );
  });
});
