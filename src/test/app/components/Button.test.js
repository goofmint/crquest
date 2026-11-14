import React from 'react';
import { render, screen } from '@testing-library/react';
import Button from '../../../js/app/components/Button';

test('Button component', async () => {
  render(<Button>Testing!</Button>);
  const btn = screen.getByRole('button');
  expect(btn).toHaveClass('Button');
  expect(btn).toHaveTextContent('Testing!');
});
