#!/usr/bin/env node

/**
 * Writes a Markdown version of every page of a repository's TypeDoc site next
 * to its HTML page (classes/Entity.html becomes classes/Entity.md), plus:
 *
 * - constants.md: every constant, grouped by category and prefix
 * - llms-symbols.json: the top-level symbols with their kind, category and
 *   summary, and the constants, from which build.mjs generates the llms.txt
 *   index of the site and the file of all its pages
 *
 * Run it in a repository after its HTML docs are built, so that TypeDoc loads
 * the repository's own version, configuration and plugins, and the pages get
 * the same URLs as the HTML ones:
 *
 *     node typedoc-markdown.mjs <outDir> <baseUrl>
 *
 * where <baseUrl> is where the pages are published, e.g.
 * https://api.playcanvas.com/engine/
 */

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

const [outDir, baseUrl] = process.argv.slice(2);
if (!outDir || !baseUrl) {
  console.error('Usage: node typedoc-markdown.mjs <outDir> <baseUrl>');
  process.exit(1);
}

// The repository's own TypeDoc
const require = createRequire(path.join(process.cwd(), 'package.json'));
const {
  Application, PackageJsonReader, PageKind, ReferenceType, Reflection, ReflectionKind, ReflectionType, TSConfigReader, Type, TypeDocReader
} = await import(pathToFileURL(require.resolve('typedoc')).href);

const KIND_NAMES = new Map([
  [ReflectionKind.Class, 'Class'],
  [ReflectionKind.Interface, 'Interface'],
  [ReflectionKind.TypeAlias, 'Type alias'],
  [ReflectionKind.Function, 'Function'],
  [ReflectionKind.Variable, 'Variable'],
  [ReflectionKind.Enum, 'Enumeration'],
  [ReflectionKind.Namespace, 'Namespace'],
  [ReflectionKind.Module, 'Module']
]);

// Tags rendered elsewhere, or that only affect how TypeDoc organizes pages
const HIDDEN_TAGS = new Set(['@category', '@group', '@param', '@typeParam', '@returns', '@hidden', '@ignore', '@internal', '@import', '@module']);

// Constants are listed together on one page rather than one index line each
const CONSTANT_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

const app = await Application.bootstrapWithPlugins({}, [new TypeDocReader(), new PackageJsonReader(), new TSConfigReader()]);
const project = await app.convert();
if (!project) {
  console.error('TypeDoc could not convert the project');
  process.exit(1);
}

// The router of the HTML output, so every page gets the URL of its HTML page
app.renderer.prepareRouter();
const router = app.renderer.router;
const pages = router.buildPages(project).filter(page => page.kind === PageKind.Reflection && page.model !== project);

// The category of each top-level symbol
const categoryOf = new Map();
const assignCategories = (container, inherited) => {
  for (const category of container.categories ?? []) {
    for (const child of category.children) {
      categoryOf.set(child, category.title);
    }
  }
  for (const child of container.children ?? []) {
    if (!categoryOf.has(child) && inherited) categoryOf.set(child, inherited);
    if (child.kind === ReflectionKind.Namespace) assignCategories(child, categoryOf.get(child));
  }
};
assignCategories(project, null);

const symbols = [];
const constants = [];
for (const page of pages) {
  const refl = page.model;
  const url = markdownUrl(page.url);
  writeFile(url, renderPage(refl));

  const constant = refl.kind === ReflectionKind.Variable && CONSTANT_NAME_RE.test(refl.name);
  const symbol = {
    name: refl.getFriendlyFullName(),
    kind: KIND_NAMES.get(refl.kind) ?? 'Symbol',
    url,
    category: categoryOf.get(refl) ?? 'Other',
    summary: firstSentence(plainText(commentOf(refl)?.summary)),
    deprecated: Boolean(commentOf(refl)?.getTag('@deprecated'))
  };
  (constant ? constants : symbols).push({ ...symbol, value: defaultValue(refl) });
}

if (constants.length) {
  writeFile('constants.md', renderConstants(constants));
}
writeFile('llms-symbols.json', `${JSON.stringify({
  name: project.name,
  version: project.packageVersion ?? null,
  categories: (project.categories ?? []).map(category => category.title),
  symbols: symbols.map(({ value, ...symbol }) => symbol),
  constants: constants.map(({ name, url, category }) => ({ name, url, category }))
}, null, 2)}\n`);

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
console.log(`Wrote ${count(pages.length, 'Markdown page')} and ${count(constants.length, 'constant')} to ${outDir}`);

/**
 * Render the page of a symbol
 */
function renderPage(refl) {
  const lines = [`# ${refl.getFriendlyFullName()}`, '', describe(refl)];
  const source = refl.sources?.[0]?.url;
  if (source) lines.push('', `Source: ${source}`);

  // The page's own comment: a function is documented on its signatures, below
  lines.push(...section(renderComment(refl.comment)));

  switch (refl.kind) {
    case ReflectionKind.Class:
    case ReflectionKind.Interface:
      lines.push(...renderMembers(refl));
      break;
    case ReflectionKind.Function:
      for (const signature of refl.signatures ?? []) {
        lines.push(...section(renderSignature(signature, refl.name)));
      }
      break;
    case ReflectionKind.TypeAlias:
      lines.push('', code(`type ${refl.name}${typeParameters(refl)} = ${refl.type}`));
      lines.push(...renderProperties(refl.type));
      break;
    case ReflectionKind.Variable:
      lines.push('', code(`const ${refl.name}: ${refl.type}${defaultValue(refl) ? ` = ${defaultValue(refl)}` : ''}`));
      lines.push(...renderProperties(refl.type));
      break;
    case ReflectionKind.Enum:
      lines.push('', '## Members', '');
      for (const member of refl.children ?? []) {
        const doc = renderParts(commentOf(member)?.summary).trim();
        lines.push(`- \`${member.name}${member.type ? ` = ${member.type}` : ''}\`${doc ? `: ${oneLine(doc)}` : ''}`);
      }
      break;
    case ReflectionKind.Namespace:
    case ReflectionKind.Module:
      lines.push('', '## Members', '');
      for (const child of refl.children ?? []) {
        const doc = firstSentence(plainText(commentOf(child)?.summary));
        const url = linkTo(child);
        lines.push(`- ${url ? `[${child.name}](${url})` : `\`${child.name}\``}${doc ? `: ${doc}` : ''}`);
      }
      break;
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/**
 * The kind of a symbol, what it extends and implements, and its category
 */
function describe(refl) {
  const parts = [KIND_NAMES.get(refl.kind) ?? 'Symbol'];
  if (refl.extendedTypes?.length) parts.push(`extends ${refl.extendedTypes.map(type => typeLink(type)).join(', ')}`);
  if (refl.implementedTypes?.length) parts.push(`implements ${refl.implementedTypes.map(type => typeLink(type)).join(', ')}`);
  if (categoryOf.has(refl)) parts.push(`category: ${categoryOf.get(refl)}`);
  if (commentOf(refl)?.getTag('@deprecated')) parts.push('deprecated');
  return parts.join(' · ');
}

/**
 * The members of a class or interface, grouped as on the HTML page, then the
 * inherited ones by the class they come from
 */
function renderMembers(refl) {
  const lines = [];

  // Inherited members by the name of the type they come from, as TypeDoc leaves
  // some references unresolved (GraphNode.enabled) but for their name
  const inherited = new Map();
  for (const group of refl.groups ?? []) {
    const own = group.children.filter(child => !child.inheritedFrom);
    for (const child of group.children.filter(child => child.inheritedFrom)) {
      const from = child.inheritedFrom.reflection?.parent;
      const name = from?.name ?? child.inheritedFrom.name.match(/^(.+)\.[^.]+$/)?.[1] ?? null;
      if (!inherited.has(name)) inherited.set(name, { from: null, children: [] });
      inherited.get(name).from ??= from;
      inherited.get(name).children.push(child);
    }
    if (own.length === 0) continue;

    lines.push('', `## ${group.title}`);
    for (const child of own) {
      lines.push('', `### ${child.kind === ReflectionKind.Constructor ? 'constructor' : child.name}`, ...renderMember(child, refl));
    }
  }

  for (const [name, { from, children }] of inherited) {
    const base = from ?? baseTypes(refl).find(type => type.name === name);
    const url = base && linkTo(base);
    lines.push('', `## Inherited from ${url ? `[${name}](${url})` : name ?? 'a base type'}`, '');
    // Every signature, so overloads and setters aren't lost
    for (const child of children) {
      const signatures = memberSignatures(child, refl);
      lines.push(`- ${(signatures.length ? signatures : [child.name]).map(text => code(text, true)).join(' · ')}`);
    }
  }
  return lines;
}

/**
 * The classes and interfaces a class or interface extends, nearest first
 */
function baseTypes(refl) {
  const bases = (refl.extendedTypes ?? []).map(type => type.reflection).filter(base => base instanceof Reflection);
  return bases.flatMap(base => [base, ...baseTypes(base)]);
}

/**
 * A member's signatures, then its documentation
 */
function renderMember(child, owner) {
  if (child.signatures?.length) {
    return child.signatures.flatMap(signature => section(renderSignature(signature, child.kind === ReflectionKind.Constructor ? `new ${owner.name}` : child.name, modifiers(child))));
  }
  const lines = ['', code(memberSignatures(child, owner).join('\n'))];
  lines.push(...section(renderComment(commentOf(child))));
  lines.push(...renderProperties(child.type));
  return lines;
}

/**
 * The signature lines of a property or accessor
 */
function memberSignatures(child, owner) {
  if (child.signatures?.length) {
    return child.signatures.map(signature => signatureText(signature, child.kind === ReflectionKind.Constructor ? `new ${owner.name}` : child.name, modifiers(child)));
  }
  if (child.kind === ReflectionKind.Accessor) {
    return [
      child.getSignature && `${modifiers(child)}get ${child.name}(): ${child.getSignature.type}`,
      child.setSignature && `${modifiers(child)}set ${child.name}(${(child.setSignature.parameters ?? []).map(parameterText).join(', ')})`
    ].filter(Boolean);
  }
  const optional = child.flags.isOptional ? '?' : '';
  const value = defaultValue(child) ? ` = ${defaultValue(child)}` : '';
  return [`${modifiers(child)}${child.name}${optional}: ${child.type ?? 'any'}${value}`];
}

/**
 * The default value of a symbol, unless TypeDoc left it out as too complex (...)
 */
function defaultValue(refl) {
  return refl.defaultValue === '...' ? undefined : refl.defaultValue;
}

function modifiers(refl) {
  return [
    refl.flags.isProtected && 'protected',
    refl.flags.isStatic && 'static',
    refl.flags.isAbstract && 'abstract',
    refl.flags.isReadonly && 'readonly'
  ].filter(Boolean).map(modifier => `${modifier} `).join('');
}

/**
 * A call signature: its code, documentation, parameters and return value
 */
function renderSignature(signature, name, prefix = '') {
  const lines = [code(signatureText(signature, name, prefix))];
  lines.push(...section(renderParts(signature.comment?.summary).trim()));

  const parameters = renderParameters(signature.parameters ?? []);
  if (parameters.length) lines.push('', '**Parameters**', '', ...parameters);

  const returns = signature.comment?.getTag('@returns');
  if (signature.kind !== ReflectionKind.ConstructorSignature && (returns || `${signature.type}` !== 'void')) {
    const doc = returns ? renderParts(returns.content).trim() : '';
    lines.push('', `**Returns** ${typeLink(signature.type)}${doc ? `: ${doc}` : ''}`);
  }
  lines.push(...section(renderBlockTags(signature.comment)));
  return lines.join('\n');
}

function signatureText(signature, name, prefix = '') {
  const params = (signature.parameters ?? []).map(parameterText).join(', ');
  const returns = signature.kind === ReflectionKind.ConstructorSignature ? '' : `: ${signature.type ?? 'void'}`;
  return `${prefix}${name}${typeParameters(signature)}(${params})${returns}`;
}

function parameterText(parameter) {
  const optional = parameter.flags.isOptional || parameter.defaultValue !== undefined ? '?' : '';
  return `${parameter.flags.isRest ? '...' : ''}${parameter.name}${optional}: ${parameterType(parameter)}`;
}

/**
 * The type of a parameter, as `object` for an options object whose properties
 * are listed under it
 */
function parameterType(parameter) {
  return parameter.type instanceof ReflectionType && parameter.type.declaration.children?.length ? 'object' : `${parameter.type ?? 'any'}`;
}

function typeParameters(refl) {
  const params = refl.typeParameters ?? [];
  return params.length ? `<${params.map(param => `${param.name}${param.type ? ` extends ${param.type}` : ''}`).join(', ')}>` : '';
}

/**
 * The parameters of a signature, with the documented properties of object
 * parameters (options) nested under them
 */
function renderParameters(parameters, prefix = '', depth = 0) {
  const lines = [];
  for (const parameter of parameters) {
    const doc = renderParts(parameter.comment?.summary).trim();
    const optional = parameter.flags.isOptional || parameter.defaultValue !== undefined;
    const details = [typeLink(parameter.type, parameterType(parameter)), optional && 'optional', defaultValue(parameter) !== undefined && `default \`${defaultValue(parameter)}\``].filter(Boolean).join(', ');
    const indent = '    '.repeat(depth);
    lines.push(`${indent}- \`${prefix}${parameter.name}\` (${details})${doc ? `: ${indentLines(doc, `${indent}  `)}` : ''}`);

    const properties = parameter.type instanceof ReflectionType ? parameter.type.declaration.children : null;
    if (properties?.length && depth < 2) {
      lines.push(...renderParameters(properties, `${prefix}${parameter.name}.`, depth + 1));
    }
  }
  return lines;
}

/**
 * The documented properties of an object type, as a list
 */
function renderProperties(type) {
  const properties = type instanceof ReflectionType ? type.declaration.children : null;
  if (!properties?.length) return [];
  return ['', '**Properties**', '', ...renderParameters(properties)];
}

/**
 * The summary and block tags of a comment
 */
function renderComment(comment) {
  return [renderParts(comment?.summary).trim(), renderBlockTags(comment)].filter(Boolean).join('\n\n');
}

function renderBlockTags(comment) {
  const blocks = [];
  for (const tag of comment?.blockTags ?? []) {
    if (HIDDEN_TAGS.has(tag.tag)) continue;

    const content = renderParts(tag.content).trim();
    switch (tag.tag) {
      case '@example':
        blocks.push(`**Example**\n\n${content}`);
        break;
      case '@deprecated':
        blocks.push(`**Deprecated**${content ? `: ${content}` : ''}`);
        break;
      case '@default':
      case '@defaultValue':
        blocks.push(`**Default** ${content}`);
        break;
      case '@see':
        blocks.push(`**See** ${content}`);
        break;
      case '@remarks':
        blocks.push(content);
        break;
      default:
        blocks.push(`**${tag.tag.slice(1)}**${content ? ` ${content}` : ''}`);
    }
  }
  return blocks.join('\n\n');
}

/**
 * Comment text as Markdown, with links to other symbols pointing to their pages
 */
function renderParts(parts = []) {
  return parts.map((part) => {
    if (part.kind !== 'inline-tag' || !['@link', '@linkcode', '@linkplain'].includes(part.tag)) {
      return part.text;
    }
    const text = part.tag === '@linkcode' ? `\`${part.text}\`` : part.text;
    const url = part.target instanceof Reflection ? linkTo(part.target) : typeof part.target === 'string' ? part.target : null;
    return url ? `[${text}](${url})` : text;
  }).join('').replace(/\r\n?/g, '\n');
}

/**
 * Comment text without markup, for summaries
 */
function plainText(parts = []) {
  return parts.map(part => part.text).join('').replace(/```[\s\S]*?```/g, ' ').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The first sentence of a text, at most about 120 characters
 */
function firstSentence(text) {
  const sentence = text.match(/^.*?(?<!\b(?:e\.g|i\.e))[.!?](?=\s|$)/i)?.[0] ?? text;
  return sentence.length > 120 ? `${sentence.slice(0, 117).replace(/\s+\S*$/, '')}...` : sentence;
}

/**
 * The comment that documents a symbol: its own, or its first signature's
 */
function commentOf(refl) {
  return refl.comment ?? refl.signatures?.[0]?.comment ?? refl.getSignature?.comment ?? refl.setSignature?.comment;
}

/**
 * The Markdown page URL of a reflection, or null if it has no page
 */
function linkTo(refl) {
  return router.hasUrl(refl) ? `${baseUrl}${markdownUrl(router.getFullUrl(refl))}` : null;
}

/**
 * A type as code, with the symbols it references, at any depth (GraphNode | null,
 * Promise<GraphicsDevice>), linked to their pages
 */
function typeLink(type, text = `${type}`) {
  const urls = new Map();
  collectReferences(type, urls);
  if (!urls.size) return `\`${text}\``;

  const names = [...urls.keys()].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\w$.])(?:${names.join('|')})(?![\\w$])`, 'g');
  let markdown = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    markdown += `${codeSpan(text.slice(last, match.index))}[\`${match[0]}\`](${urls.get(match[0])})`;
    last = match.index + match[0].length;
  }
  return markdown + codeSpan(text.slice(last));
}

/**
 * The page URLs of the symbols a type and the types within it reference, by the
 * name the type's text shows
 */
function collectReferences(type, urls) {
  if (type instanceof ReferenceType && type.reflection instanceof Reflection) {
    const url = linkTo(type.reflection);
    if (url) urls.set(type.reflection.name, url);
  }
  for (const value of Object.values(type ?? {})) {
    for (const child of [value].flat()) {
      if (child instanceof Type) collectReferences(child, urls);
    }
  }
}

/**
 * Text as code, with the spaces around it outside the backticks
 */
function codeSpan(text) {
  const [, before, core, after] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return core ? `${before}\`${core}\`${after}` : text;
}

function markdownUrl(url) {
  return url.replace(/\.html(?=$|#)/, '.md');
}

/**
 * The page of every constant, by category and by prefix (BLEND_*, FILTER_*...),
 * with their values. Each constant's own page has its description.
 */
function renderConstants(list) {
  const lines = [
    `# ${project.name}: Constants`,
    '',
    `${list.length} constants by category, grouped by prefix, with their values. The page of each constant, with its description, is at \`${baseUrl}variables/<NAME>.md\`.`
  ];
  const byCategory = groupBy(list, constant => constant.category);
  for (const [category, members] of [...byCategory].sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))) {
    lines.push('', `## ${category}`, '');
    const byPrefix = groupBy(members.sort((a, b) => a.name.localeCompare(b.name)), constant => constant.name.split('_')[0]);
    for (const [prefix, family] of byPrefix) {
      const values = family.map(constant => `\`${constant.name}\`${constant.value ? ` = ${constant.value}` : ''}`).join(', ');
      lines.push(`- ${family.length > 1 ? `\`${prefix}_*\`: ` : ''}${values}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function groupBy(list, key) {
  const groups = new Map();
  for (const item of list) {
    if (!groups.has(key(item))) groups.set(key(item), []);
    groups.get(key(item)).push(item);
  }
  return groups;
}

function code(text, inline = false) {
  if (inline) return `\`${text.replace(/\s+/g, ' ')}\``;
  return `\`\`\`ts\n${text}\n\`\`\``;
}

function section(text) {
  return text ? ['', text] : [];
}

function oneLine(text) {
  return text.replace(/\s*\n\s*/g, ' ');
}

/**
 * Indent the lines after the first, to continue a list item
 */
function indentLines(text, indent) {
  return text.replace(/\n(?=[^\n])/g, `\n${indent}`);
}

function writeFile(url, text) {
  const file = path.join(outDir, ...url.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
