import React from 'react';
import { act, render } from '@testing-library/react';
import ObjectiveDescription from '../../../js/app/components/hack_interface/objective_description/ObjectiveDescription';
import { context } from '../../../js/app/common/context';
import i18n from '../../../js/app/i18n';

vi.mock('../../../js/app/common/context', async () => {
  const { createContext } = await import('react');
  return { context: createContext({}), setContext: vi.fn() };
});

vi.mock('../../../js/app/common/assetLoader', () => ({
  readLocalizedFile: vi.fn().mockResolvedValue(''),
  resolveAbsolutePath: vi.fn(),
}));

test.each(['en', 'ja'])('emphasizes the XP and rank when an objective is cleared (%s)', async language => {
  await i18n.changeLanguage(language);
  try {
    const view = await act(async () => render(
      <context.Provider value={{ completedObjectives: { first: true }, numObjectives: 1 }}>
        <ObjectiveDescription objective={{ objectivePath: 'first', rewards: { xp: 25 } }} cleared />
      </context.Provider>
    ));

    const emphasizedRewards = [...view.container.querySelectorAll('.objective-cleared em')];
    expect(emphasizedRewards.map(element => element.textContent)).toEqual(['25 XP', 'S']);
    view.unmount();
  } finally {
    await i18n.changeLanguage('en');
  }
});
