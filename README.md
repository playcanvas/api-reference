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
7. Generate a combined sitemap.xml that includes URLs from all repositories for better SEO

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
