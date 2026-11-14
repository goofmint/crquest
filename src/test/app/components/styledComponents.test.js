import React from 'react';
import { render } from '@testing-library/react';
import styled from 'styled-components';

// Same shape as the styled components in menu/Journal.jsx: a default-imported
// styled.div with a template interpolation and rules for nested elements.
const Box = styled.div`
  border: 1px solid ${'rgb(1, 2, 3)'};
  position: relative;

  h5 {
    position: absolute;
    top: -10px;
    margin: 0;
  }
`;

describe('styled-components 6 on React 19', () => {
  test('applies the generated class, including rules for nested elements', () => {
    const { container } = render(
      <Box>
        <h5>Title</h5>
      </Box>
    );
    const box = container.firstChild;
    const title = box.querySelector('h5');
    expect(box.className).toMatch(/\S/);
    expect(getComputedStyle(box).position).toBe('relative');
    expect(getComputedStyle(box).borderTopColor).toBe('rgb(1, 2, 3)');
    expect(getComputedStyle(title).position).toBe('absolute');
    expect(getComputedStyle(title).top).toBe('-10px');
  });

  test('forwards DOM props and children', () => {
    const { container } = render(
      <Box id="quest" title="t">
        text
      </Box>
    );
    expect(container.firstChild).toHaveAttribute('id', 'quest');
    expect(container.firstChild).toHaveAttribute('title', 't');
    expect(container.firstChild).toHaveTextContent('text');
  });
});
