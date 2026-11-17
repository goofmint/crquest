import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../../src-tauri/tauri.conf.json'),
    'utf8'
  )
);

// Issue #169: with Tauri's drag-drop handler enabled (the default), the
// webview does not deliver in-page HTML5 drag and drop events (the inventory
// and avatar screens rely on them). The app has no file-drop feature.
describe('main window configuration', () => {
  test('disables the Tauri drag-drop handler so HTML5 drag and drop works', () => {
    const main = config.app.windows.find(window => window.label === 'main');
    expect(main.dragDropEnabled).toBe(false);
  });
});
