import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import TitleScreen from '../../../js/app/components/TitleScreen';
import audioManager from '../../../js/app/common/audio/index';
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
