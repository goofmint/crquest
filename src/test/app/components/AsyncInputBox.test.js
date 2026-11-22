import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

vi.mock('keypress.js', () => ({
  keypress: { Listener: class { simple_combo() {} stop_listening() {} } },
}));

import AsyncInputBox from '../../../js/app/components/menu/settings/AsyncInputBox';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function mount(onSubmit, props = {}) {
  return render(
    <AsyncInputBox
      inputLabel="code"
      defaultButtonLabel="Go"
      resolvingButtonLabel="Working"
      onSubmit={onSubmit}
      {...props}
    />
  );
}

const type = value => fireEvent.change(screen.getByLabelText('code'), { target: { value } });

describe('AsyncInputBox', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  test('shows the success message and clears the input', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true, message: 'Done' });
    const onSuccess = vi.fn();
    mount(onSubmit, { onSuccess });
    type('abc');
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(onSubmit).toHaveBeenCalledWith('abc');
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByLabelText('code')).toHaveValue('');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  test('a failed result shows its message, or the default one', async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce({ success: false, message: 'No' }).mockResolvedValueOnce({ success: false });
    mount(onSubmit);
    type('abc');
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(screen.getByText('No')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  test('a rejected submission ends in an error and the box can be used again', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ success: true, message: 'Ok' });
    mount(onSubmit);
    type('abc');
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(screen.getByText('Ok')).toBeInTheDocument();
  });

  test('a synchronous throw is also an error', async () => {
    mount(() => { throw new Error('sync'); });
    await act(async () => fireEvent.click(screen.getByText(/^(Go|Working)$/)));
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  test('clicks before the first one resolves submit only once', async () => {
    const pending = deferred();
    const onSubmit = vi.fn().mockReturnValue(pending.promise);
    mount(onSubmit);
    type('abc');
    const button = screen.getByText(/^(Go|Working)$/);
    // Both clicks happen before React re-renders the disabled state.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Working')).toBeInTheDocument();
    await act(async () => pending.resolve({ success: true }));
    expect(screen.getByText('Go')).toBeInTheDocument();
  });

  test('nothing is set after unmount', async () => {
    const pending = deferred();
    const { unmount } = mount(vi.fn().mockReturnValue(pending.promise));
    fireEvent.click(screen.getByText(/^(Go|Working)$/));
    unmount();
    await act(async () => pending.resolve({ success: true }));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
