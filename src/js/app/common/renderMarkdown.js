import { Lexer, Marked, Renderer } from 'marked';
import hljs from 'highlight.js';

// Objectives and validation prompts may include authored HTML. Validate
// Markdown-generated URLs without altering the extension's literal markup.
function isAllowedUrl(href, allowMail = false) {
  const decoder = document.createElement('textarea');
  decoder.innerHTML = href.replace(/</g, '&lt;');
  try {
    const { protocol } = new URL(decoder.value, 'https://terminal.quest/');
    return protocol === 'https:' || protocol === 'http:' ||
      (allowMail && protocol === 'mailto:');
  } catch {
    return false;
  }
}

function readHtmlBlock(source) {
  // CommonMark stops HTML blocks at blank lines, including the lines left
  // by EJS branches. Preserve authored tables and divs through their closing tag.
  const opening = /^ {0,3}<(table|div)(?=[\s>])/i.exec(source);
  if (!opening) return false;

  const tags = new RegExp(`<(\\/?)(${opening[1]})(?=[\\s>])[^<>]*>`, 'gi');
  let depth = 0;
  for (const tag of source.matchAll(tags)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) {
      const raw = source.slice(0, tag.index + tag[0].length);
      return { type: 'html', raw, text: raw, block: true, pre: false };
    }
  }
  return false;
}

function renderMarkdown(source, objective) {
  const headingCounts = new Map();
  const markdown = new Marked({
    gfm: objective,
    breaks: objective,
    tokenizer: {
      html(source) {
        // A standalone inline tag must not hide Markdown inside its text.
        if (/^ {0,3}<\/?(?:b|em|i|span|strong)(?=[\s>])/i.test(source)) {
          return undefined;
        }
        return readHtmlBlock(source);
      },
    },
    renderer: {
      html({ text, block }) {
        if (!block || !/^ {0,3}<details(?=[\s>])/i.test(text)) return false;

        return text.replace(/(<summary\b[^<>]*>)([^\n]*?)(<\/summary>)/gi,
          (_, open, contents, close) =>
            open + this.parser.parseInline(Lexer.lexInline(contents, this.options)) + close
        );
      },
      heading({ depth, text, tokens }) {
        // Match the IDs of the previous GitHub and vanilla heading styles.
        let id = objective
          ? text.toLowerCase().replace(/ /g, '-').replace(/[&+$,\/:;=?@\"#{}|^¨~\[\]`\\*)(%.!'<>]/g, '')
          : text.toLowerCase().replace(/[^\w]/g, '');
        const previous = headingCounts.get(id) ?? 0;
        headingCounts.set(id, previous + 1);
        if (previous) id += `-${previous}`;
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link(token) {
        if (!isAllowedUrl(token.href, true)) {
          return this.parser.parseInline(token.tokens);
        }
        if (!objective || token.href.startsWith('#')) {
          return false;
        }
        return Renderer.prototype.link.call(this, token)
          .replace(/^<a href="[^"]*"/, '$& rel="noopener noreferrer" target="_blank"');
      },
      image(token) {
        if (!isAllowedUrl(token.href)) return '';
        return false;
      },
      code(token) {
        if (!objective) return false;

        const language = token.lang?.trim().split(/\s+/)[0];
        const { value } = language && hljs.getLanguage(language)
          ? hljs.highlight(token.text, { language })
          : hljs.highlightAuto(token.text);
        const html = Renderer.prototype.code.call(this, {
          ...token,
          text: value,
          escaped: true,
        });
        return html.includes('<code class="')
          ? html.replace('<code class="', '<code class="hljs ')
          : html.replace('<code>', '<code class="hljs">');
      },
    },
  });
  return markdown.parse(source ?? '');
}

export function renderObjectiveMarkdown(source) {
  return renderMarkdown(source, true);
}

export function renderValidationMarkdown(source) {
  return renderMarkdown(source, false);
}
