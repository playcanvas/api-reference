import MarkdownIt from 'markdown-it';

/**
 * Renders the pages of a product's llms-full.txt as a single HTML page for
 * people: a table of contents, then every page as a section of its own. Links
 * between the pages, including those to members (Entity.md#addcomponent),
 * become links within the file.
 */

const CSS = `
:root { color-scheme: light dark; --line: color-mix(in srgb, currentColor 18%, transparent); --tint: color-mix(in srgb, currentColor 6%, transparent); }
body { max-width: 1000px; margin: 0 auto; padding: 0 1.5rem 4rem; font: 16px/1.55 system-ui, sans-serif; }
code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.875em; }
pre { padding: 0.75rem 1rem; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--tint); border-radius: 6px; }
:not(pre) > code { padding: 0.1em 0.3em; background: var(--tint); border-radius: 4px; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--line); padding: 0.3rem 0.6rem; vertical-align: top; }
section { margin-top: 3rem; border-top: 1px solid var(--line); }
h3 { margin-top: 2rem; }
.contents { columns: 15rem 4; column-gap: 2rem; }
.contents h3 { margin: 0 0 0.3rem; break-after: avoid; }
.contents ul { margin: 0 0 1.5rem; padding: 0; list-style: none; }
.to-contents { position: fixed; top: 0.75rem; right: 0.75rem; padding: 0.3rem 0.7rem; border: 1px solid var(--line); border-radius: 4px; background: Canvas; }
[id] { scroll-margin-top: 1rem; }
h3:target { background: color-mix(in srgb, Highlight 20%, transparent); }
`;

/**
 * The anchor TypeDoc gives a name, which the pages' member links use
 */
function slug(name, seen) {
  const base = name.trim()
  .replace(/[ -⁯⸀-⹿\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
  .replace(/\s/g, '-')
  .replace(/--+/, '-')
  .toLowerCase() || '_';
  let count = seen.get(base) ?? 0;
  let anchor = base;
  if (seen.has(base)) {
    do {
      anchor = `${base}-${++count}`;
    } while (seen.has(anchor));
  }
  seen.set(base, count);
  return anchor;
}

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * @param {object} options - The bundle
 * @param {string} options.title - The title of the bundle
 * @param {string} options.summary - A Markdown line about the product
 * @param {string} options.productUrl - The URL of the product's folder, with a trailing slash
 * @param {{ url: string, text: string }[]} options.pages - The pages, by URL, with their Markdown
 * @param {{ title: string, items: { name: string, url: string }[] }[]} options.contents - The
 *   sections of the table of contents, with links to pages
 * @returns {string} The HTML page
 */
export function formatBundleHtml({ title, summary, productUrl, pages, contents }) {
  // classes/Entity.md is the section #classes/Entity, and its member addComponent is
  // #classes/Entity--addcomponent
  const pageIds = new Map(pages.map(page => [page.url, page.url.slice(productUrl.length).replace(/\.md$/, '')]));
  const link = (href) => {
    const [url, fragment] = href.split('#');
    const id = pageIds.get(url);
    return id && `#${fragment ? `${id}--${fragment}` : id}`;
  };

  // Raw HTML stays text: the pages show types such as Array<Vec3> outside code
  const md = new MarkdownIt({ linkify: true });
  md.linkify.set({ fuzzyLink: false });
  md.core.ruler.push('bundle_links', (state) => {
    const { id, seen } = state.env;
    state.tokens.forEach((token, i) => {
      // Member headings
      if (token.type === 'heading_open' && token.tag === 'h3') {
        token.attrSet('id', `${id}--${slug(state.tokens[i + 1].content, seen)}`);
      }
      for (const child of token.children ?? []) {
        if (child.type === 'link_open') {
          const href = link(child.attrGet('href'));
          if (href) child.attrSet('href', href);
        }
      }
    });
  });

  const sections = pages.map(page => `<section id="${escape(pageIds.get(page.url))}">\n${md.render(page.text, { id: pageIds.get(page.url), seen: new Map() })}</section>`);
  const toc = contents.map(({ title: heading, items }) => `<div><h3>${escape(heading)}</h3><ul>${
    items.map(item => `<li><a href="${escape(link(item.url) ?? item.url)}">${escape(item.name)}</a></li>`).join('')
  }</ul></div>`);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${CSS}</style>
</head>
<body>
<a class="to-contents" href="#contents">Contents</a>
<h1>${escape(title)}</h1>
<p>${md.renderInline(summary)}</p>
<p>The same pages as Markdown, for AI agents: <a href="llms-full.txt">llms-full.txt</a>.</p>
<h2 id="contents">Contents</h2>
<nav class="contents">${toc.join('')}</nav>
${sections.join('\n')}
</body>
</html>
`;

  // A link to a member without a heading of its own leads to its page
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]));
  html = html.replace(/href="#([^"]+)--[^"]*"/g, (match, page) => (ids.has(match.slice(7, -1)) ? match : `href="#${page}"`));
  return html;
}
