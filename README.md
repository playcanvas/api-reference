# PlayCanvas API Reference

This repository builds the combined PlayCanvas API Reference. The API reference is a collection of documentation from multiple PlayCanvas repositories.

## Requirements

Ensure you have Node.js 18+ installed.

## Building the API Reference

To build the combined API reference, run:

```bash
npm run build
```

This cross-platform script will:

1. Clone the 6 PlayCanvas repositories:
   - Engine
   - PCUI
   - Observer
   - Editor API
   - PCUI Graph
   - Web Components

2. Install dependencies for each repository

3. Build the TypeDoc documentation for each repository

4. Copy the documentation to a central `docs` folder

5. Create a main index.html file that allows navigation between the different API references

## Viewing

To view the built API reference, run:

```bash
npm run serve
```

Then point your browser at `http://localhost:3000`.

## Manual Update Process

If you need to update any individual repository:

1. Remove the specific repository from the `repos` directory:
   ```bash
   # For Unix-like systems
   rm -rf repos/[repo-name]
   
   # For Windows
   rmdir /s /q repos\[repo-name]
   ```

2. Re-run the build script:
   ```bash
   npm run build
   ```

Or you can modify the script to update only specific repositories as needed.

## Deployment

The API reference is automatically deployed to GitHub Pages whenever the main branch is updated.
