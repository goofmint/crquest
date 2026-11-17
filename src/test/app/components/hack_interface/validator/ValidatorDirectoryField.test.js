import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('../../../../../js/app/platform/dialog', () => ({
  showDirectoryDialog: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}));
vi.mock('../../../../../js/app/common/firebase', () => ({
  Firestore: { collection: vi.fn() },
  default: {},
}));

vi.mock('../../../../../js/app/common/levelLoader', () => ({ __esModule: true, default: {} }));
vi.mock('../../../../../js/app/common/assetLoader', () => ({ requireFromExtension: vi.fn() }));
vi.mock('../../../../../js/app/common/world', () => ({ __esModule: true, default: vi.fn() }));
vi.mock('../../../../../js/app/common/analytics', () => ({ __esModule: true, default: {} }));
vi.mock('../../../../../js/app/common/gameEvents', () => ({ __esModule: true, default: {} }));
vi.mock('../../../../../js/app/components/context_provider/itemsHelper', () => ({
  addItems: vi.fn(),
  populateLoadoutWithItems: vi.fn(),
}));
vi.mock('../../../../../js/app/components/hack_interface/validator/ValidationHelper', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('../../../../../js/app/common/context', () => ({
  context: React.createContext({}),
  setContext: vi.fn(),
  emitter: { on: vi.fn(), off: vi.fn() },
}));

import { showDirectoryDialog } from '../../../../../js/app/platform/dialog';
import Validator from '../../../../../js/app/components/hack_interface/validator/Validator';

// #173: a folder chosen with the dialog is granted to the fs scope; a typed or
// pasted path is not. The "directory" field type offers the dialog next to an
// editable text field.
const objective = {
  show_ide: false,
  validation_fields: [
    { name: 'workspacePath', type: 'directory', label: 'Choose the folder', placeholder: '/Users/jane/quest' },
    { name: 'note', type: 'text', label: 'A text field' },
  ],
};

const renderValidator = () =>
  render(
    React.createElement(Validator, {
      objective,
      hackObject: { complete: false, level: { levelName: 'l' }, objectiveName: 'o' },
      ideVisible: false,
      launchIde: vi.fn(),
      onDone: vi.fn(),
      onSuccess: vi.fn(),
      onReset: vi.fn(),
    })
  );

const pathInput = container => container.querySelector('input[placeholder="/Users/jane/quest"]');

beforeEach(() => {
  vi.clearAllMocks();
  window.firebase = { firestore: vi.fn(() => ({})) };
});

describe('Validator directory field', () => {
  test('renders an editable text input and a Choose Folder button', () => {
    const { container } = renderValidator();
    expect(pathInput(container)).not.toBeNull();
    expect(pathInput(container).getAttribute('type')).toBe('text');
    expect(screen.getByText('Choose Folder')).toBeTruthy();
  });

  test('puts the chosen folder into the field', async () => {
    showDirectoryDialog.mockResolvedValue('/Users/jane/Downloads/test');
    const { container } = renderValidator();
    fireEvent.click(screen.getByText('Choose Folder'));
    await waitFor(() => expect(pathInput(container).value).toBe('/Users/jane/Downloads/test'));
  });

  test('passes the current value as the dialog start and keeps it on cancel', async () => {
    showDirectoryDialog.mockResolvedValue(undefined);
    const { container } = renderValidator();
    fireEvent.change(pathInput(container), { target: { value: '/typed/path' } });
    fireEvent.click(screen.getByText('Choose Folder'));
    await waitFor(() => expect(showDirectoryDialog).toHaveBeenCalled());
    expect(showDirectoryDialog.mock.calls[0][0].defaultPath).toBe('/typed/path');
    expect(pathInput(container).value).toBe('/typed/path');
  });

  test('does not change how a plain text field renders', () => {
    const { container } = renderValidator();
    const text = [...container.querySelectorAll('input')].filter(
      input => input.placeholder !== '/Users/jane/quest'
    );
    expect(text.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Choose Folder')).toHaveLength(1);
  });
});
