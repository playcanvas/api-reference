import fs from 'fs';
import path from 'path';

/**
 * Generates the LLM files of the API site from the Markdown pages and symbols
 * that typedoc-markdown.mjs writes for each product:
 *
 * - /<product>/llms.txt: the index of a product, rendered from the template
 *   llms/indexes/<product>/llms.txt
 * - /<product>/llms-full.txt: every page of the product in one file
 * - /llms.txt: the index of the products, from llms/indexes/llms.txt
 *
 * Templates are llms.txt Markdown with these placeholders:
 *
 * - {{SYMBOLS}}: the product's symbols, by category, with their summaries
 * - {{VERSION}}: the product's version, or {{VERSION:<repository>}} in the root index
 * - {{ALL_PAGES}}: a link to the file of all the product's pages
 *
 * Links in templates are relative to the index and must lead to published
 * files. A list item linking a symbol's page without a description gets the
 * symbol's summary.
 */

// Size limits, well below the 100,000 characters some fetch tools read of a file
export const ROOT_INDEX_BUDGET = 15 * 1024;
export const INDEX_BUDGET = 50 * 1024;

const KIND_ORDER = ['Class', 'Interface', 'Type alias', 'Enumeration', 'Function', 'Variable', 'Namespace', 'Module'];
const KIND_SECTIONS = {
  'Class': 'Classes',
  'Interface': 'Interfaces',
  'Type alias': 'Type aliases',
  'Enumeration': 'Enumerations',
  'Function': 'Functions',
  'Variable': 'Variables',
  'Namespace': 'Namespaces',
  'Module': 'Modules'
};

// TypeDoc's category of uncategorized symbols, and one for internal ones, go last
const LAST_CATEGORIES = ['Other', 'Internal'];

// The lengths summaries are shortened to, in turn, until an index fits its budget
const SUMMARY_LENGTHS = [120, 90, 70, 50];

/**
 * Generate the LLM files of every product and the root index
 *
 * @param {object} options - Where things are
 * @param {string} options.docsDir - The site's output directory
 * @param {string} options.templatesDir - The directory of index templates
 * @param {string} options.siteUrl - The site's URL, without a trailing slash
 * @param {{ name: string, folder: string }[]} options.products - Each product's
 *   repository name and folder on the site
 * @returns {string[]} The problems found
 */
export function generateLlmsFiles({ docsDir, templatesDir, siteUrl, products }) {
  const problems = [];
  const versions = {};

  for (const { name, folder } of products) {
    const symbolsFile = path.join(docsDir, folder, 'llms-symbols.json');
    const templateFile = path.join(templatesDir, folder, 'llms.txt');
    if (!fs.existsSync(symbolsFile)) {
      problems.push(`${folder}: there is no llms-symbols.json, which a full build writes`);
      continue;
    }
    if (!fs.existsSync(templateFile)) {
      problems.push(`${folder}: there is no index template at ${path.relative(process.cwd(), templateFile)}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(symbolsFile, 'utf8'));
    const template = readText(templateFile);
    const productUrl = `${siteUrl}/${folder}/`;
    versions[name] = data.version;

    // The uncategorized interfaces and type aliases of a categorized product, the
    // types of other APIs' parameters and results, are listed on a page of their own
    const otherTypes = catalogSymbols(data).filter(symbol => isOtherType(data, symbol));
    if (otherTypes.length) {
      fs.writeFileSync(path.join(docsDir, folder, 'other-types.md'), [
        `# ${template.match(/^# (.+)$/m)?.[1] ?? data.name}: Other Types`,
        '',
        `${otherTypes.length} interfaces and type aliases without a category, mostly the types of other symbols' parameters and results.`,
        '',
        ...otherTypes.map(symbol => `- [${symbol.name}](${productUrl}${symbol.url})${symbol.summary ? `: ${symbol.summary}` : ''}`),
        ''
      ].join('\n'));
    }
    const otherTypesItem = otherTypes.length ? `- [Other types](${productUrl}other-types.md): ${otherTypes.length} interfaces and type aliases without a category, mostly the types of other symbols' parameters and results.` : null;

    // Every page of the product: its symbols in the order of the index, then its constants
    const symbols = orderSymbols(data);
    const pages = [...symbols.map(symbol => symbol.url), ...(data.constants.length ? ['constants.md', ...data.constants.map(constant => constant.url)] : [])];
    const bundle = formatBundle({
      title: `${template.match(/^# (.+)$/m)?.[1] ?? data.name}: All Pages`,
      summary: fill(template.match(/^> (.+)$/m)?.[1] ?? '', { VERSION: data.version }),
      indexUrl: `${productUrl}llms.txt`,
      pages: pages.map(url => ({ url: `${productUrl}${url}`, text: readText(path.join(docsDir, folder, ...url.split('/'))) }))
    });
    fs.writeFileSync(path.join(docsDir, folder, 'llms-full.txt'), bundle);

    // Shorten the summaries until the index fits its budget
    let text;
    let indexProblems;
    for (const maxSummary of SUMMARY_LENGTHS) {
      indexProblems = [];
      text = renderIndex(template, {
        source: path.relative(process.cwd(), templateFile),
        indexUrl: `${productUrl}llms.txt`,
        docsDir,
        siteUrl,
        summaries: new Map(symbols.map(symbol => [`${productUrl}${symbol.url}`, shorten(symbol.summary, maxSummary)])),
        vars: {
          SYMBOLS: renderCatalog(data, productUrl, maxSummary, otherTypesItem),
          VERSION: data.version,
          ALL_PAGES: `- [All pages in one file](${productUrl}llms-full.txt): ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} (${Math.ceil(Buffer.byteLength(bundle) / 1024)} KB), for downloading and searching rather than reading into context.`
        },
        budget: INDEX_BUDGET
      }, indexProblems);
      if (Buffer.byteLength(text) <= INDEX_BUDGET) break;
    }
    problems.push(...indexProblems);
    fs.writeFileSync(path.join(docsDir, folder, 'llms.txt'), text);
  }

  const rootTemplate = path.join(templatesDir, 'llms.txt');
  const rootVars = Object.fromEntries(Object.entries(versions).map(([name, version]) => [`VERSION:${name}`, version]));
  fs.writeFileSync(path.join(docsDir, 'llms.txt'), renderIndex(readText(rootTemplate), {
    source: path.relative(process.cwd(), rootTemplate),
    indexUrl: `${siteUrl}/llms.txt`,
    docsDir,
    siteUrl,
    summaries: new Map(),
    vars: rootVars,
    budget: ROOT_INDEX_BUDGET
  }, problems));

  return problems;
}

/**
 * Render an index template: fill in the summaries of bare symbol links and the
 * placeholders, and make links absolute, checking they lead to published files
 */
function renderIndex(template, { source, indexUrl, docsDir, siteUrl, summaries, vars, budget }, problems) {
  const withSummaries = template.replace(/^(\s*- \[[^\]]+\]\(([^)\s]+)\))\s*$/gm, (line, item, target) => {
    const summary = summaries.get(resolve(target, indexUrl));
    return summary ? `${item}: ${summary}` : line;
  });

  const filled = withSummaries.replace(/\{\{([\w:-]+)\}\}/g, (match, name) => {
    if (vars[name] === undefined || vars[name] === null) {
      problems.push(`${source}: no value for ${match}`);
      return match;
    }
    return String(vars[name]);
  });

  const text = filled.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    const url = resolve(target, indexUrl);
    if (url.startsWith(`${siteUrl}/`)) {
      const file = path.join(docsDir, ...new URL(url).pathname.split('/'));
      if (!fs.existsSync(file)) {
        problems.push(`${source}: ${target} leads to ${url}, which is not published`);
      }
    }
    return `](${url})`;
  });

  if (Buffer.byteLength(text) > budget) {
    problems.push(`${source}: ${Math.ceil(Buffer.byteLength(text) / 1024)} KB is over its ${budget / 1024} KB budget`);
  }
  return text;
}

/**
 * The symbols of a product, by category (or by kind if it has no categories),
 * as lists of links with their summaries
 */
function renderCatalog(data, productUrl, maxSummary, otherTypesItem) {
  const categorized = isCategorized(data);
  const sections = new Map();
  for (const symbol of catalogSymbols(data).filter(listed => !isOtherType(data, listed))) {
    const title = categorized || symbol.category !== 'Other' ? symbol.category : KIND_SECTIONS[symbol.kind] ?? 'Other';
    if (!sections.has(title)) sections.set(title, []);
    const notes = [shorten(symbol.summary, maxSummary), symbol.deprecated && '(deprecated)'].filter(Boolean).join(' ');
    sections.get(title).push(`- [${symbol.name}](${productUrl}${symbol.url})${notes ? `: ${notes}` : ''}`);
  }
  if (otherTypesItem) {
    if (!sections.has('Other')) sections.set('Other', []);
    sections.get('Other').push(otherTypesItem);
  }
  return [...sections].map(([title, items]) => [`## ${title}`, '', ...items].join('\n')).join('\n\n');
}

/**
 * The symbols an index lists, in order: namespace members (math.clamp) are
 * listed on their namespace's page instead
 */
function catalogSymbols(data) {
  return orderSymbols(data).filter(symbol => !symbol.name.includes('.'));
}

function isCategorized(data) {
  return data.categories.some(category => !LAST_CATEGORIES.includes(category));
}

function isOtherType(data, symbol) {
  return isCategorized(data) && symbol.category === 'Other' && (symbol.kind === 'Interface' || symbol.kind === 'Type alias');
}

/**
 * Symbols by category, then kind, then name
 */
function orderSymbols(data) {
  const rank = (category) => {
    const last = LAST_CATEGORIES.indexOf(category);
    return last >= 0 ? data.categories.length + last : data.categories.indexOf(category);
  };
  return [...data.symbols].sort((a, b) => rank(a.category) - rank(b.category) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    a.name.localeCompare(b.name));
}

/**
 * Pages as a single file: a header, then every page with its URL
 */
function formatBundle({ title, summary, indexUrl, pages }) {
  const lines = [`# ${title}

> ${summary}

Index: ${indexUrl}
Total Pages: ${pages.length}
Generated: ${new Date().toISOString().split('T')[0]}

${'='.repeat(80)}
`];
  for (const page of pages) {
    lines.push(`URL: ${page.url}

${page.text.trim()}

${'-'.repeat(80)}
`);
  }
  return lines.join('\n');
}

/**
 * Shorten a text to at most a length, at a word boundary
 */
function shorten(text, length) {
  if (!text || text.length <= length) return text;
  return `${text.slice(0, length - 3).replace(/\s+\S*$/, '')}...`;
}

function fill(text, vars) {
  return text.replace(/\{\{([\w:-]+)\}\}/g, (match, name) => vars[name] ?? match);
}

function resolve(target, base) {
  return new URL(target, base).href;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}
