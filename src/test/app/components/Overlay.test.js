import React from 'react';
import { render, act } from '@testing-library/react';

const { emitter } = vi.hoisted(() => ({ emitter: new (require('events'))() }));
vi.mock('../../../js/app/common/context', () => ({ emitter, setContext: vi.fn() }));
vi.mock('../../../js/app/components/nav_map/components/NavMap', () => ({ default: () => null }));
vi.mock('../../../js/app/components/FogOwlFlying', () => ({ default: () => null }));
vi.mock('../../../js/app/components/IFrameOverlay', () => ({ default: () => null }));
vi.mock('../../../js/app/components/DevFundamentalsElevator', () => ({ default: () => null }));
vi.mock('../../../js/app/components/CloudSaveChoice', () => ({
  default: props => <div data-testid="choice" data-state={props.displayFsmState} />,
}));

import Overlay from '../../../js/app/components/Overlay';

let ref;
const show = value => act(() => void emitter.emit('contextUpdate:overlayComponent', value));
const lifecycle = [];

beforeEach(() => {
  emitter.removeAllListeners();
  lifecycle.length = 0;
  emitter.on('levelLifecycle', e => lifecycle.push(`${e.name}:${e.componentKey}`));
  ref = React.createRef();
  render(<Overlay ref={ref} />);
});

const state = () => ref.current.state.displayFsmState;
const finish = () => act(() => ref.current.state.displayFsm.action('finishTransition'));

describe('Overlay', () => {
  test('show, finish, hide, finish', () => {
    show({ key: 'cloudSaveChoice', props: {} });
    expect(state()).toBe('showing');
    finish();
    expect(state()).toBe('shown');
    show('');
    expect(state()).toBe('hiding');
    finish();
    expect(state()).toBe('hidden');
  });

  test('a show request during hiding runs once after hiding finished; the latest one wins', () => {
    show({ key: 'cloudSaveChoice', props: {} });
    finish();
    show('');
    expect(state()).toBe('hiding');
    show('fogOwlFlying');
    show({ key: 'cloudSaveChoice', props: { n: 2 } }); // replaces the earlier pending request
    expect(state()).toBe('hiding');
    expect(ref.current.state.componentKey).toBe('cloudSaveChoice');
    finish(); // hidden -> the pending request is shown
    expect(state()).toBe('showing');
    expect(ref.current.state.componentProps).toEqual({ n: 2 });
    expect(lifecycle.filter(l => l.startsWith('overlayComponentDidShow'))).toEqual([
      'overlayComponentDidShow:cloudSaveChoice',
      'overlayComponentDidShow:cloudSaveChoice',
    ]);
    finish();
    expect(state()).toBe('shown');
  });

  test('a hide request after a pending show discards it', () => {
    show({ key: 'cloudSaveChoice', props: {} });
    finish();
    show('');
    show('fogOwlFlying');
    show('');
    finish();
    expect(state()).toBe('hidden');
  });
});
