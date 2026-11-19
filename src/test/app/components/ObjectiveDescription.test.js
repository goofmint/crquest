import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import ObjectiveDescription from '../../../js/app/components/hack_interface/objective_description/ObjectiveDescription';
import { context } from '../../../js/app/common/context';
import i18n from '../../../js/app/i18n';
import { readLocalizedFile, resolveAbsolutePath } from '../../../js/app/common/assetLoader';

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

test('renders an async EJS objective before converting its Markdown', async () => {
  readLocalizedFile.mockResolvedValueOnce(
    '# <%= env.exercise.value %>\n\n<%= await resolveAbsolutePath("exercise.txt") %>'
  );
  resolveAbsolutePath.mockResolvedValueOnce('/workspace/exercise.txt');

  const view = await act(async () => render(
    <context.Provider value={{ env: { exercise: { value: 'Async exercise' } } }}>
      <ObjectiveDescription objective={{ objectivePath: 'first' }} />
    </context.Provider>
  ));

  fireEvent.click(view.getByRole('button', { name: 'Objective' }));
  expect(view.getByRole('heading', { name: 'Async exercise' })).toBeInTheDocument();
  expect(view.getByText('/workspace/exercise.txt')).toBeInTheDocument();
});
