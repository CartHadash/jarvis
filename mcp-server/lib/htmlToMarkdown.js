/**
 * Convert TipTap-serialised HTML node content to clean markdown.
 *
 * Tools call this on the `content` field before returning to Claude.
 * Markdown is ~30-50% fewer tokens than HTML and reads more naturally.
 * Pass `format: 'html'` to a tool to skip conversion when you need
 * structural fidelity (e.g. mention nodes with custom data attrs).
 */

import TurndownService from 'turndown';

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Disable turndown's aggressive markdown escaping. Output goes to
// Claude as plain text, not back through a markdown parser, so escaping
// "#" or "*" just adds noise and inflates token count.
td.escape = (s) => s;

td.addRule('preserveMentions', {
  filter: (node) =>
    node.nodeName === 'SPAN' &&
    (node.getAttribute('data-type') === 'mention' ||
      node.classList?.contains('mention')),
  replacement: (content, node) => {
    const id = node.getAttribute('data-id');
    return id ? `@[${content}](node:${id})` : `@${content}`;
  },
});

td.addRule('imgWithAlt', {
  filter: 'img',
  replacement: (_c, node) => {
    const alt = node.getAttribute('alt') ?? '';
    const src = node.getAttribute('src') ?? '';
    return src ? `![${alt}](${src})` : '';
  },
});

export function htmlToMarkdown(html) {
  if (typeof html !== 'string' || html.length === 0) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  try {
    return td.turndown(html).trim();
  } catch {
    return html;
  }
}
