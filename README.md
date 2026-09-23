# PlayCanvas API Reference

This repository builds the combined PlayCanvas API Reference. The API reference is a collection of documentation from multiple PlayCanvas repositories.

## Requirements

Ensure you have Node.js 18+ installed.

## Configuration

Repository configuration is stored in `repos-config.json`. This file defines the repositories to be cloned, their URLs, and default branches:

```json
{
  "repositories": [
    {
      "name": "engine",
      "url": "https://github.com/playcanvas/engine.git",
      "branch": "main"
    },
    ...
  ]
}
```

You can modify this file to change default branches, add new repositories, or remove existing ones.

## Building the API Reference

To build the combined API reference, run:

```bash
npm run build
```

This cross-platform script will:

1. Load the repository configuration from `repos-config.json`
2. Clone the configured PlayCanvas repositories
3. Install dependencies for each repository
4. Build the TypeDoc documentation for each repository
5. Copy the documentation to a central `docs` folder
6. Merge the per-product TypeDoc search indexes into a combined `docs/assets/search.js` that powers the landing page's global search
7. Create a main index.html file that allows navigation between the different API references
8. Generate a combined sitemap.xml that includes URLs from all repositories for better SEO
9. Generate the LLM files: a Markdown version of every page and `llms.txt` indexes for AI agents

### Global Search

The landing page provides a search across all products. It reuses TypeDoc's own
search client (`main.js`, copied from the engine build) pointed at a combined
index that `build.mjs` produces by decoding each product's
`docs/<product>/assets/search.js` (`window.searchData` = base64, deflate-compressed
JSON), prefixing row URLs with the product folder, tagging rows with a
`product-<folder>` class (styled as a badge by `assets/landing.css`), and
rebuilding a single lunr index in the same format.

Per-repository search behavior is configured in `repos-config.json`:

- `searchExclude`: omit the product from the combined index
- `searchBoost`: relevance multiplier for all of the product's results
- `searchKindBoosts`: per-reflection-kind multipliers (e.g. `{ "128": 2 }` boosts classes, mirroring the engine's TypeDoc `searchGroupBoosts`)

> [!IMPORTANT]
> The merge step depends on TypeDoc 0.28 internals: the `window.searchData`
> wrapper, deflate encoding, and a serialized lunr **2.3.9** index (the `lunr`
> devDependency in `package.json` is pinned to match the version bundled in
> TypeDoc's client). The build validates each product's index and skips it with
> a warning if the format changes — revisit `mergeSearchIndexes()` in `build.mjs`
> when upgrading TypeDoc.

### LLM Files

For AI agents, the build publishes:

- A Markdown version of every page next to its HTML page (`engine/classes/Entity.md`
  for `engine/classes/Entity.html`), linked from the page with
  `<link rel="alternate" type="text/markdown">`. `llms/typedoc-markdown.mjs` writes
  them after each repository's docs are built, using the repository's own TypeDoc,
  configuration and plugins, so the pages match the HTML ones. It also writes
  `constants.md` and `llms-symbols.json`, the symbols with their categories and
  summaries.
- `/<product>/llms.txt`, the index of a product, rendered from the template
  `llms/indexes/<product>/llms.txt`: a hand-written preamble, then the symbols by
  category (`{{SYMBOLS}}`). Uncategorized interfaces and type aliases of a
  categorized product are listed on `other-types.md`, and namespace members on
  their namespace's page.
- `/<product>/llms-full.txt`, every page of a product in one file.
- `/llms.txt`, the index of the products, from `llms/indexes/llms.txt`.

Links in the templates are relative to the index and must lead to published pages.
An index must stay within 50 KB (15 KB for `/llms.txt`), so summaries are shortened
if needed. Problems are warnings locally and fail the build in CI. To regenerate the
indexes from an existing build, run `npm run build:landing`.

> [!NOTE]  
> The build script automatically cleans and recreates the `repos` directory each time it's run, ensuring you always get a fresh build with the latest code from the configured branches.

### Specifying Repository Branches

The default branches for all repositories are defined in the `repos-config.json` file. This is the recommended place to set your branch configurations:

```json
{
  "repositories": [
    {
      "name": "engine",
      "url": "https://github.com/playcanvas/engine.git",
      "branch": "release-2.6"
    },
    // ... other repositories
  ]
}
```

For temporary changes without modifying the configuration file, you can override branches using command-line arguments in the format `repo=branch`:

```bash
# Override the engine branch for a single build
npm run build engine=dev

# Override multiple repositories for a single build
npm run build engine=dev pcui=feature/new-components
```

The repository names used in the command line must match the `name` fields in the `repos-config.json` file.

## Viewing

To view the built API reference, run:

```bash
npm run serve
```

Then point your browser at `http://localhost:3000`.

## Deployment

The API reference is automatically deployed to GitHub Pages whenever the main branch is updated.
