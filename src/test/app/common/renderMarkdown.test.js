import { renderObjectiveMarkdown, renderValidationMarkdown } from '../../../js/app/common/renderMarkdown';

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

test('renders validation labels using the original vanilla formatting', () => {
  const html = renderValidationMarkdown(
    '# Test Heading\n\n*a* [x](https://example.com)\n\n- one\n- two'
  );
  const document = parseHtml(html);
  expect(document.querySelector('h1#testheading').textContent).toBe('Test Heading');
  expect(document.querySelector('em').textContent).toBe('a');
  expect(document.querySelector('a').getAttribute('target')).toBeNull();
  expect([...document.querySelectorAll('li')].map(li => li.textContent)).toEqual(['one', 'two']);
});

test('preserves objective tables, task lists, line breaks, and link behavior', () => {
  const html = renderObjectiveMarkdown([
    '# Test Heading',
    '',
    '~~line one~~',
    'line two',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '- [x] Done',
    '',
    '[External](https://example.com) [Section](#test-heading) [Local](page.html)',
  ].join('\n'));
  const document = parseHtml(html);
  expect(document.querySelector('h1#test-heading').textContent).toBe('Test Heading');
  expect(document.querySelector('p del').textContent).toBe('line one');
  expect(document.querySelector('p br')).not.toBeNull();
  expect(document.querySelector('table td').textContent).toBe('1');
  expect(document.querySelector('li input').checked).toBe(true);
  const [external, fragment, relative] = document.querySelectorAll('a');
  expect(external.target).toBe('_blank');
  expect(external.rel).toBe('noopener noreferrer');
  expect(fragment.target).toBe('');
  expect(relative.target).toBe('_blank');
});

test('preserves authored HTML and highlights fenced code without changing its text', () => {
  const code = 'const el = "<section>";';
  const html = renderObjectiveMarkdown([
    '<details><summary>Hint</summary><em>Read me</em></details>',
    '',
    '```javascript',
    code,
    '```',
    '',
    '![Sample](images/example.png)',
  ].join('\n'));
  const document = parseHtml(html);
  expect(document.querySelector('details > summary').textContent).toBe('Hint');
  const highlighted = document.querySelector('code.hljs.language-javascript');
  expect(highlighted.querySelector('.hljs-keyword').textContent).toBe('const');
  expect(highlighted.textContent.trim()).toBe(code);
  expect(highlighted.querySelector('section')).toBeNull();
  expect(document.querySelector('img').getAttribute('src')).toBe('images/example.png');
});

test('preserves blank lines in authored tables and inline Markdown in authored tags', () => {
  const html = renderObjectiveMarkdown([
    '<table>',
    '',
    '    <tr><td>Ready</td><td>Pending</td></tr>',
    '',
    '</table>',
    '',
    '<i>Use `status`</i>',
    '',
    '<details><summary>Run `help`</summary>More information</details>',
  ].join('\n'));
  const document = parseHtml(html);
  expect([...document.querySelectorAll('table td')].map(cell => cell.textContent))
    .toEqual(['Ready', 'Pending']);
  expect(document.querySelector('pre')).toBeNull();
  expect(document.querySelector('i code').textContent).toBe('status');
  expect(document.querySelector('details > summary > code').textContent).toBe('help');
});
