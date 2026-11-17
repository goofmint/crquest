import React from 'react';
import { renderHook, render } from '@testing-library/react';
import useSpriteSheet from '../../../../js/app/components/nav_map/hooks/useSpriteSheet';

// Issue #170: SpriteSheet is an arrow-function factory; calling it with `new`
// throws "is not a constructor" in the Vite build.
describe('useSpriteSheet', () => {
  test('returns a component factory without throwing', () => {
    const { result } = renderHook(() =>
      useSpriteSheet({
        sheet: 'asset://localhost/a.png',
        tileWidth: 16,
        tileHeight: 16,
        scale: 2,
      })
    );
    expect(typeof result.current).toBe('function');
    const { container } = render(<>{result.current({ row: 1, col: 2 })}</>);
    const sprite = container.querySelector('div > div');
    expect(sprite.style.width).toBe('32px');
    expect(sprite.firstChild.style.background).toContain('asset://localhost/a.png');
    expect(sprite.firstChild.style.background).toContain('-32px -16px');
  });
});
