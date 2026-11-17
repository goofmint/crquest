import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';

// #168: WKWebView / WebView2 keep WebAudio suspended until the first user
// gesture, so the title screen waits for one before starting the music.
const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  getContext: vi.fn(),
  combos: {},
}));

vi.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { pageview: vi.fn(), event: vi.fn(), appVersion: 'test' },
}));
vi.mock('../../../js/app/common/listener', () => ({
  __esModule: true,
  default: {
    simple_combo: (combo, handler) => {
      mocks.combos[combo] = handler;
      return combo;
    },
    unregister_combo: vi.fn(),
  },
}));
vi.mock('../../../js/app/common/audio/index', () => ({
  __esModule: true,
  default: {
    muted: false,
    music: { play: mocks.play, fadeOutAll: vi.fn() },
  },
}));
vi.mock('../../../js/app/common/context', () => ({
  getContext: mocks.getContext,
  setContext: vi.fn(),
}));

import TitleScreen from '../../../js/app/components/TitleScreen';

const GATE = 'click or press any key';
const START = 'press spacebar to start';

describe('TitleScreen audio gate (#168)', () => {
  let close;

  beforeEach(() => {
    mocks.play.mockClear();
    mocks.getContext.mockReset();
    mocks.getContext.mockReturnValue(true); // hasSeenCinematic
    mocks.combos = {};
    close = vi.fn();
  });

  const mount = () => render(React.createElement(TitleScreen, { close }));

  test('does not play music on mount and shows the gate', () => {
    const { container } = mount();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(container.textContent).toContain(GATE);
    expect(container.textContent).not.toContain(START);
  });

  test('a click starts the music and shows the start screen', () => {
    const { container, getByText } = mount();
    fireEvent.click(getByText(GATE));
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledWith('overture_b');
    expect(container.textContent).toContain(START);
    expect(close).not.toHaveBeenCalled();
  });

  test('any non-space key starts the music once', () => {
    const { container } = mount();
    fireEvent.keyDown(document, { key: 'a', code: 'KeyA' });
    fireEvent.keyDown(document, { key: 'b', code: 'KeyB' });
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(START);
    expect(close).not.toHaveBeenCalled();
  });

  test('the first space begins but does not start the game; the second does', () => {
    mount();
    // Space is handled by the spacebar combo only (not by the any-key listener)
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    expect(mocks.play).not.toHaveBeenCalled();

    act(() => mocks.combos.space());
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();

    act(() => mocks.combos.space());
    expect(close).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  test('a first key that keypress.js stops from bubbling still begins (Escape)', () => {
    // keypress.js calls stopPropagation() for the combos it handles
    const stop = e => e.stopPropagation();
    document.body.addEventListener('keydown', stop);
    const { container } = mount();
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    document.body.removeEventListener('keydown', stop);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(START);
  });

  test('a held Space (auto-repeat) is not counted as the second press', () => {
    mount();
    act(() => mocks.combos.space({}, 1, false));
    expect(mocks.play).toHaveBeenCalledTimes(1);

    act(() => mocks.combos.space({}, 2, true));
    act(() => mocks.combos.space({}, 3, true));
    expect(close).not.toHaveBeenCalled();

    act(() => mocks.combos.space({}, 1, false));
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('stops listening for keys after unmount', () => {
    const { unmount } = mount();
    unmount();
    fireEvent.keyDown(document, { key: 'a', code: 'KeyA' });
    expect(mocks.play).not.toHaveBeenCalled();
  });
});
