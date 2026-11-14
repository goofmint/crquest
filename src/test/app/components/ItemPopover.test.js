import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemPopover from '../../../js/app/components/ItemPopover';

const item = {
  name: 'sword',
  displayName: 'Sword of Tests',
  description: '<p>Cuts bugs.</p>',
  layerPath: 'avatars/parts/sword.png',
};

// react-tiny-popover 8 on React 19: the popover opens 500ms after the pointer
// enters the child, is rendered into document.body with the ItemPopover class
// and closes again when the pointer leaves.
describe('ItemPopover', () => {
  test('shows the item after hovering and hides it on leave', async () => {
    render(
      <ItemPopover item={item}>
        <span>icon</span>
      </ItemPopover>
    );
    const trigger = screen.getByText('icon').parentElement;
    expect(trigger).toHaveClass('pa1');
    expect(screen.queryByText(item.displayName)).toBeNull();

    fireEvent.mouseEnter(trigger);
    const title = await screen.findByText(item.displayName, {}, { timeout: 2000 });
    const container = title.closest('.react-tiny-popover-container');
    expect(container).toHaveClass('ItemPopover', 'bg-light-gray', 'black');
    expect(container.parentElement).toBe(document.body);
    expect(container.style.overflow).toBe('hidden');
    expect(screen.getByText('Cuts bugs.')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    await waitFor(() => expect(screen.queryByText(item.displayName)).toBeNull());
  });

  test('marks the selected item and never opens when left before the delay', async () => {
    render(
      <ItemPopover item={item} isSelected>
        <span>icon</span>
      </ItemPopover>
    );
    const trigger = screen.getByText('icon').parentElement;
    expect(trigger).toHaveClass('ba', 'bw2', 'b--green');

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(screen.queryByText(item.displayName)).toBeNull();
  });

  test('closes the popover when the component unmounts while open', async () => {
    const { unmount } = render(
      <ItemPopover item={item}>
        <span>icon</span>
      </ItemPopover>
    );
    fireEvent.mouseEnter(screen.getByText('icon').parentElement);
    await screen.findByText(item.displayName, {}, { timeout: 2000 });
    unmount();
    expect(document.querySelector('.react-tiny-popover-container')).toBeNull();
  });
});
