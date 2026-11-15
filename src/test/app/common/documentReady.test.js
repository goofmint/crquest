import fs from 'node:fs';
import path from 'node:path';
import { onDocumentReady } from '../../../js/app/common/documentReady';

function makeDoc(readyState) {
  return { readyState, addEventListener: vi.fn() };
}

describe('onDocumentReady', () => {
  test('while loading (Electron): waits for DOMContentLoaded, does not call early', () => {
    const doc = makeDoc('loading');
    const callback = vi.fn();
    onDocumentReady(doc, callback);
    expect(callback).not.toHaveBeenCalled();
    expect(doc.addEventListener).toHaveBeenCalledTimes(1);
    expect(doc.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', callback);
    doc.addEventListener.mock.calls[0][1]();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test.each(['interactive', 'complete'])(
    'after DOMContentLoaded (Tauri, readyState %s): runs immediately, once, without a listener',
    readyState => {
      const doc = makeDoc(readyState);
      const callback = vi.fn();
      onDocumentReady(doc, callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(doc.addEventListener).not.toHaveBeenCalled();
    }
  );

  test('works with a real jsdom-like document lifecycle', () => {
    const listeners = {};
    const doc = {
      readyState: 'loading',
      addEventListener: (name, fn) => (listeners[name] = fn),
    };
    const callback = vi.fn();
    onDocumentReady(doc, callback);
    doc.readyState = 'interactive';
    listeners.DOMContentLoaded();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('index.jsx startup wiring', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../js/index.jsx'),
    'utf8'
  );

  test('has no direct electron / remote access', () => {
    expect(source).not.toMatch(/require\(['"]electron['"]\)/);
    expect(source).not.toMatch(/\bremote\b/);
  });

  test('renders through onDocumentReady, not a bare DOMContentLoaded listener', () => {
    expect(source).toContain('onDocumentReady(document');
    expect(source).not.toContain("addEventListener('DOMContentLoaded'");
  });
});
