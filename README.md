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
6. Create a main index.html file that allows navigation between the different API references

> **Note:** The build script automatically cleans and recreates the `repos` directory each time it's run, ensuring you always get a fresh build with the latest code from the configured branches.

### Specifying Repository Branches

By default, the branches specified in `repos-config.json` are used for all repositories. You can override these defaults for any repository by using command-line arguments in the format `repo=branch`:

```bash
# Build using the dev branch for the engine repository
npm run build engine=dev

# Specify multiple repositories with different branches
npm run build engine=dev pcui=feature/new-components editor-api=beta
```

Available repository names:
- `engine`
- `pcui`
- `observer`
- `editor-api`
- `pcui-graph`
- `web-components`

## Viewing

To view the built API reference, run:

```bash
npm run serve
```

Then point your browser at `http://localhost:3000`.

## Deployment

The API reference is automatically deployed to GitHub Pages whenever the main branch is updated.
