import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AvatarSelector from '../../../js/app/components/AvatarSelector';
import i18n from '../../../js/app/i18n';

vi.mock('../../../js/app/components/CustomAvatarCreator', () => ({ default: () => null }));
vi.mock('../../../js/app/components/game/DynamicLevel', () => ({ default: class DynamicLevel {} }));
vi.mock('../../../js/app/common/fs_utils', () => ({ staticFileUrl: file => `/${file}` }));

test('renders preset avatars and a translated custom-avatar choice', async () => {
  await i18n.changeLanguage('ja');
  try {
    const selectAvatar = vi.fn();
    const view = render(<AvatarSelector avatar={1} selectAvatar={selectAvatar} />);

    expect(screen.getAllByAltText('あなたのキャラクターのアバター').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('カスタム'));
    expect(selectAvatar).toHaveBeenCalledWith(0);
    view.unmount();
  } finally {
    await i18n.changeLanguage('en');
  }
});
