import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import TitleScreen from '../../../js/app/components/TitleScreen';
import audioManager from '../../../js/app/common/audio/index';
import sharedListener from '../../../js/app/common/listener';
import { getContext } from '../../../js/app/common/context';

vi.mock('react-i18next', () => ({
  withTranslation: () => Component => props =>
    React.createElement(Component, { ...props, t: key => key }),
}));
vi.mock('../../../js/app/common/analytics', () => ({
  default: { pageview: vi.fn(), event: vi.fn() },
}));
vi.mock('../../../js/app/common/listener', () => ({
  default: { simple_combo: vi.fn(), unregister_combo: vi.fn() },
}));
vi.mock('../../../js/app/common/audio/index', () => ({
  default: { music: { play: vi.fn(), stop: vi.fn(), fadeOutAll: vi.fn() } },
}));
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(),
  setContext: vi.fn(),
}));

it.each([false, true])('stops the title track when entering the game (seen cinematic: %s)', seen => {
  vi.clearAllMocks();
  getContext.mockReturnValue(seen);
  const close = vi.fn(() => view.unmount());
  const view = render(React.createElement(TitleScreen, { close }));

  expect(audioManager.music.play).toHaveBeenCalledWith('overture_b');
  fireEvent.click(view.getByText('ui.title.pressStart'));
  if (!seen) {
    expect(audioManager.music.fadeOutAll).toHaveBeenCalledOnce();
    fireEvent.ended(view.container.querySelector('video'));
  }

  expect(close).toHaveBeenCalledOnce();
  expect(audioManager.music.stop).toHaveBeenCalledExactlyOnceWith('overture_b');
});

describe('title music handoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not restart title music after the first-time cinematic ends', () => {
    getContext.mockReturnValue(false);
    const close = vi.fn();
    const view = render(React.createElement(TitleScreen, { close }));
    fireEvent.click(view.getByText('ui.title.pressStart'));
    fireEvent.ended(view.container.querySelector('video'));

    expect(close).toHaveBeenCalledOnce();
    expect(audioManager.music.play).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('restarts title music and stays open on Back', () => {
    getContext.mockReturnValue(true);
    const close = vi.fn();
    const view = render(React.createElement(TitleScreen, { close }));
    fireEvent.click(view.getByText('ui.title.briefing'));
    fireEvent.click(view.getByText('ui.title.back'));

    expect(audioManager.music.play).toHaveBeenCalledTimes(2);
    expect(audioManager.music.play).toHaveBeenLastCalledWith('overture_b');
    expect(close).not.toHaveBeenCalled();
    view.unmount();
  });

  it('removes key listeners on unmount', () => {
    getContext.mockReturnValue(true);
    sharedListener.simple_combo.mockReturnValueOnce('space').mockReturnValueOnce('esc');
    const view = render(React.createElement(TitleScreen, { close: vi.fn() }));
    view.unmount();

    expect(sharedListener.unregister_combo).toHaveBeenCalledWith('space');
    expect(sharedListener.unregister_combo).toHaveBeenCalledWith('esc');
  });
});
