import React from 'react';
import { render } from '@testing-library/react';

vi.mock('../../../../../js/app/platform/dialog', () => ({
  showDirectoryDialog: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}));
vi.mock('../../../../../js/app/common/assetLoader', () => ({ requireFromExtension: vi.fn() }));
vi.mock('../../../../../js/app/common/world', () => ({ __esModule: true, default: vi.fn() }));
vi.mock('../../../../../js/app/common/analytics', () => ({ __esModule: true, default: { event: vi.fn() } }));
vi.mock('../../../../../js/app/common/gameEvents', () => ({
  __esModule: true,
  default: { logMissionObjectiveCompletion: vi.fn() },
}));
vi.mock('../../../../../js/app/components/context_provider/itemsHelper', () => ({ addItems: vi.fn() }));
vi.mock('../../../../../js/app/components/hack_interface/validator/ValidationHelper', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('../../../../../js/app/common/context', () => ({
  context: React.createContext({}),
  setContext: vi.fn(),
  emitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

import { context, setContext, emitter } from '../../../../../js/app/common/context';
import Validator from '../../../../../js/app/components/hack_interface/validator/Validator';

// #190: the client does not report achievements anywhere or judge the
// event period. The server scores achievements that it certified itself.
describe('Validator completion and live events', () => {
  test('completing an objective with a legacy liveEvent writes nothing and keeps the local flow', () => {
    const markAsComplete = vi.fn();
    const hackObject = { complete: false, level: { levelName: 'l' }, objectiveName: 'o', markAsComplete };
    const objective = { title: 'T', show_ide: false, validation_fields: [], rewards: { xp: 5, items: [] } };
    render(
      <context.Provider
        value={{ xp: 10, completedObjectives: {}, liveEvent: { id: 'e', guid: 'g' }, settings: { name: 'P' } }}
      >
        <Validator
          objective={objective}
          hackObject={hackObject}
          ideVisible={false}
          launchIde={vi.fn()}
          onDone={vi.fn()}
          onSuccess={vi.fn()}
          onReset={vi.fn()}
        />
      </context.Provider>
    );

    window.completeCurrentObjective();

    expect(markAsComplete).toHaveBeenCalled();
    expect(setContext).toHaveBeenCalledWith({ xp: 15 });
    expect(setContext).toHaveBeenCalledWith(
      expect.objectContaining({ completedObjectives: expect.objectContaining({ 'l.o': expect.any(Object) }) })
    );
    expect(emitter.emit).toHaveBeenCalledWith('levelLifecycle', { name: 'objectiveCompleted', objective: 'o' });
    // The legacy liveEvent is neither written to nor disconnected by the client.
    expect(setContext).not.toHaveBeenCalledWith({ liveEvent: null });
  });
});
