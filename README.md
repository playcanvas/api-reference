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

### Global Search

The landing page provides a search across all products. It reuses TypeDoc's own
search client (`main.js`, copied from the engine build) pointed at a combined
index that `build.mjs` produces by decoding each product's
`docs/<product>/assets/search.js` (`window.searchData` = base64, deflate-compressed
JSON), prefixing row URLs with the product folder, tagging rows with a
`product-<folder>` class (styled as a badge by `assets/landing.css`), and
rebuilding a single lunr index in the same format.

Per-repository search behavior is configured in `repos-config.json`:

- `searchExclude`: omit the product from the combined index (used for the legacy `engine-v1`)
- `searchBoost`: relevance multiplier for all of the product's results
- `searchKindBoosts`: per-reflection-kind multipliers (e.g. `{ "128": 2 }` boosts classes, mirroring the engine's TypeDoc `searchGroupBoosts`)

> [!IMPORTANT]
> The merge step depends on TypeDoc 0.28 internals: the `window.searchData`
> wrapper, deflate encoding, and a serialized lunr **2.3.9** index (the `lunr`
> devDependency in `package.json` is pinned to match the version bundled in
> TypeDoc's client). The build validates each product's index and skips it with
> a warning if the format changes — revisit `mergeSearchIndexes()` in `build.mjs`
> when upgrading TypeDoc.

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
