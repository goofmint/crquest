import { reportFailure } from '../../../js/app/common/reportFailure';
import { showAlert } from '../../../js/app/platform/dialog';

vi.mock('../../../js/app/platform/dialog', () => ({ showAlert: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('reportFailure', () => {
  it('logs to the console and shows a dialog containing the message and the error message', async () => {
    const error = new Error('disk full');
    showAlert.mockResolvedValue(undefined);
    await reportFailure('Could not save', error);
    expect(console.error).toHaveBeenCalledWith('Could not save', error);
    expect(showAlert).toHaveBeenCalledWith('Could not save\ndisk full');
  });

  it('does not throw when the dialog fails, and logs that failure too', async () => {
    const dialogError = new Error('no dialog');
    showAlert.mockRejectedValue(dialogError);
    await expect(reportFailure('m', new Error('x'))).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('Could not show the failure dialog', dialogError);
  });
});
